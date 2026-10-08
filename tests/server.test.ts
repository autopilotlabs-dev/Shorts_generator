import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// Isolate the database + media folder for this test run.
process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "nightshade-test-"));

const { fitToNarration, NARRATION_LEAD, NARRATION_TAIL } = await import("../lib/engine/types");
const { mediaPath, mediaUrl, createProject, getProject, updateProject, listProjects } = await import("../lib/server/projects");
const { validatePlan } = await import("../lib/server/validate");
const { db, newId, now } = await import("../lib/server/db");
const { encodeWav } = await import("../lib/server/render-video");

function makeUser() {
  const id = newId("u_");
  db().prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, 'x', ?)").run(id, `${id}@t.dev`, "T", now());
  return id;
}

test("fitToNarration stretches scenes to fit their voice clip", () => {
  const [a, b] = fitToNarration([
    { id: "a", text: "x", visual: "moon", mood: "dread", duration: 2, effects: [], sfx: [], narration: { url: "/v", duration: 4, voice: "v", text: "x" } },
    { id: "b", text: "y", visual: "moon", mood: "dread", duration: 3, effects: [], sfx: [] },
  ]);
  assert.equal(a.duration, Math.round((4 + NARRATION_LEAD + NARRATION_TAIL) * 10) / 10);
  assert.equal(b.duration, 3);
});

test("mediaPath only resolves the owner's files and blocks traversal", () => {
  const url = mediaUrl("u_1/p_1/img.png");
  assert.equal(url, "/api/media/u_1/p_1/img.png");
  assert.ok(mediaPath("u_1", url)?.endsWith(path.join("media", "u_1", "p_1", "img.png")));
  assert.equal(mediaPath("u_2", url), null);
  assert.equal(mediaPath("u_1", "/api/media/u_1/../u_2/x.png"), null);
  assert.equal(mediaPath("u_1", "/api/media/u_1/%2e%2e/u_2/x.png"), null);
  assert.equal(mediaPath("u_1", "/etc/passwd"), null);
});

test("validatePlan sanitises scenes and strips foreign media", () => {
  const plan = validatePlan(
    {
      title: "t",
      scenes: [
        {
          id: "s1",
          text: "hello",
          visual: "nope",
          mood: "terror",
          duration: 99,
          effects: ["fog", "fog", "bad"],
          sfx: ["knock", "nuke"],
          image: "/api/media/u_other/p/x.png",
          narration: { url: "/api/media/u_me/p/v.mp3", duration: 2, voice: "onyx", text: "hello" },
        },
      ],
    },
    "u_me",
  );
  const s = plan.scenes[0];
  assert.equal(s.visual, "void");
  assert.equal(s.duration, 20);
  assert.deepEqual(s.effects, ["fog"]);
  assert.deepEqual(s.sfx, ["knock"]);
  assert.equal(s.image, undefined);
  assert.equal(s.narration?.url, "/api/media/u_me/p/v.mp3");
});

test("projects are scoped to their owner", () => {
  const alice = makeUser();
  const bob = makeUser();
  const p = createProject(alice, { title: "Mine", story: "story", duration: 99 });
  assert.equal(p.duration, 60);
  assert.equal(getProject(bob, p.id), null);
  assert.equal(updateProject(bob, p.id, { title: "stolen" }), null);
  assert.equal(updateProject(alice, p.id, { title: "Renamed" })?.title, "Renamed");
  assert.equal(listProjects(bob).length, 0);
});

test("encodeWav writes a valid 16-bit PCM header", () => {
  const ch = [new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0, 0.25, -0.25, -1])];
  const buf = { numberOfChannels: 2, length: 4, sampleRate: 48000, getChannelData: (c: number) => ch[c] } as unknown as AudioBuffer;
  const wav = encodeWav(buf);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt16LE(22), 2);
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.length, 44 + 4 * 2 * 2);
  assert.equal(wav.readInt16LE(44 + 12), 32767); // sample 3, left = 1.0
});
