import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { planLocally } from "../shared/planner";
import { MAX_DURATION } from "../shared/types";
import { aiAvailable, planWithClaude } from "./ai-planner";

const PORT = Number(process.env.PORT) || 8787;
const MAX_STORY_CHARS = 6000;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;

const app = express();
app.use(express.json({ limit: "200kb" }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });

app.get("/api/health", (_req, res) => {
  res.json({ ai: aiAvailable(), ffmpeg: ffmpegAvailable });
});

app.post("/api/plan", async (req, res) => {
  const { story, duration, title, useAi } = req.body ?? {};
  if (typeof story !== "string" || !story.trim()) {
    res.status(400).json({ error: "story is required" });
    return;
  }
  if (story.length > MAX_STORY_CHARS) {
    res.status(400).json({ error: `story must be under ${MAX_STORY_CHARS} characters` });
    return;
  }
  const seconds = Number(duration) || 30;

  if (useAi !== false && aiAvailable()) {
    try {
      const plan = await planWithClaude(story, seconds, title);
      res.json({ plan, source: "ai" });
      return;
    } catch (err) {
      console.error("AI planning failed, falling back to local planner:", err);
    }
  }
  res.json({ plan: planLocally(story, seconds, title), source: "local" });
});

// Browsers record WebM; most short-video platforms prefer H.264 MP4.
app.post("/api/convert", upload.single("video"), async (req, res) => {
  if (!ffmpegAvailable) {
    res.status(501).json({ error: "ffmpeg is not installed on the server" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "video file is required" });
    return;
  }
  const dir = await mkdtemp(path.join(tmpdir(), "horror-short-"));
  const input = path.join(dir, "in.webm");
  const output = path.join(dir, "out.mp4");
  try {
    await writeFile(input, req.file.buffer);
    await run("ffmpeg", [
      "-y", "-i", input,
      "-t", String(MAX_DURATION + 1),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-r", "30", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
      output,
    ]);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="horror-short.mp4"');
    res.send(await readFile(output));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "conversion failed" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr}`))));
  });
}

// In production, serve the built frontend.
const dist = path.join(root, "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`Horror Shorts server on http://localhost:${PORT}  (AI planner: ${aiAvailable() ? "on" : "off"}, ffmpeg: ${ffmpegAvailable ? "on" : "off"})`);
});
