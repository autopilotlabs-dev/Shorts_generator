import "./style.css";
import { planLocally } from "../shared/planner";
import {
  EFFECTS,
  fitDurations,
  MAX_DURATION,
  MIN_DURATION,
  MOODS,
  SFX,
  totalDuration,
  VISUALS,
  type Scene,
  type StoryPlan,
} from "../shared/types";
import { SoundEngine, type Mix } from "./audio/engine";
import { Renderer, sceneAt, type CaptionStyle, type RenderOptions } from "./render/renderer";
import { SAMPLES } from "./samples";
import { Player, type Recording } from "./video/player";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- state ----------
let plan: StoryPlan | null = null;
let target = 30;
let captionStyle: CaptionStyle = "bold";
let currentTime = 0;
let recording: (Recording & { url: string }) | null = null;
let isRecording = false;
let health = { ai: false, ffmpeg: false };
let sampleIdx = 0;
let sound: SoundEngine | null = null;
let player: Player | null = null;

const canvas = $<HTMLCanvasElement>("canvas");
const renderer = new Renderer(canvas);
const thumbCanvas = document.createElement("canvas");
thumbCanvas.width = 108;
thumbCanvas.height = 192;
const thumbRenderer = new Renderer(thumbCanvas);

const storyInput = $<HTMLTextAreaElement>("storyInput");
const titleInput = $<HTMLInputElement>("titleInput");

function opts(): RenderOptions {
  return { captionStyle, showTitle: $<HTMLInputElement>("titleCard").checked, captions: true };
}
function mix(): Mix {
  return { music: +$<HTMLInputElement>("musicVol").value / 100, sfx: +$<HTMLInputElement>("sfxVol").value / 100 };
}

function getPlayer(): Player {
  // AudioContext must be created after a user gesture.
  if (!player) {
    sound = new SoundEngine();
    player = new Player(canvas, renderer, sound, {
      onTime: (t, total) => onTime(t, total),
      onEnd: () => {
        setPlaying(false);
        // Show a frame from the opening scene instead of the final fade-to-black.
        if (plan) setTimeout(() => !player?.playing && drawAt(Math.min(1.2, totalDuration(plan!))), 400);
      },
    });
  }
  return player;
}

// ---------- helpers ----------
function toast(msg: string, error = false) {
  const el = $("toast");
  el.textContent = msg;
  el.className = `toast show${error ? " error" : ""}`;
  clearTimeout((toast as any).t);
  (toast as any).t = setTimeout(() => (el.className = "toast"), 3800);
}

const fmt = (s: number) => {
  const v = Math.max(0, Math.floor(s));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "horror-short";
}

function storage(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return null;
}

// ---------- theme ----------
function applyTheme(theme: string | null) {
  if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
  const dark =
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  for (const id of ["themeToggle", "themeToggleTop"]) $(id).dataset.icon = dark ? "sun" : "moon";
  $("themeToggle").lastChild!.textContent = dark ? "Light mode" : "Dark mode";
}
function toggleTheme() {
  const dark =
    document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  const next = dark ? "light" : "dark";
  storage("theme", next);
  applyTheme(next);
}
applyTheme(storage("theme"));
$("themeToggle").addEventListener("click", toggleTheme);
$("themeToggleTop").addEventListener("click", toggleTheme);

// ---------- server health ----------
async function checkHealth() {
  try {
    const r = await fetch("/api/health");
    if (r.ok) health = await r.json();
  } catch {
    /* static hosting: no server */
  }
  $("aiChip").classList.toggle("on", health.ai);
  $("mp4Chip").classList.toggle("on", health.ffmpeg);
  $("aiPromoTitle").textContent = health.ai ? "AI Director is on" : "AI Director";
  $("aiPromoText").innerHTML = health.ai
    ? "Claude breaks your story into scenes, picks visuals, mood and sound cues."
    : "Using the built-in planner. Set <code>ANTHROPIC_API_KEY</code> on the server to let Claude direct your scenes.";
  const useAi = $<HTMLInputElement>("useAi");
  useAi.checked = health.ai;
  useAi.disabled = !health.ai;
  $("aiSwitchWrap").classList.toggle("disabled", !health.ai);
}
checkHealth();

// ---------- stats ----------
function updateStats() {
  const text = storyInput.value;
  $("charCount").textContent = `${text.length} / 6000`;
  const w = plan ? plan.scenes.reduce((a, s) => a + words(s.text), 0) : words(text);
  $("statWords").textContent = String(w);
  const dur = plan ? totalDuration(plan) : target;
  const pace = w / dur;
  $("statPace").textContent =
    w === 0 ? "Reading pace" : pace > 3.4 ? `${pace.toFixed(1)}/s · too fast, trim text` : `${pace.toFixed(1)}/s · comfortable`;
  $("statScenes").textContent = String(plan?.scenes.length ?? 0);
  $("navScenes").textContent = String(plan?.scenes.length ?? 0);
  $("statSceneAvg").textContent = plan ? `${(dur / plan.scenes.length).toFixed(1)}s per scene` : "—";
  const sfx = plan ? plan.scenes.reduce((a, s) => a + s.sfx.length, 0) : 0;
  $("statSfx").textContent = String(sfx);
  if (plan) {
    const counts = new Map<string, number>();
    plan.scenes.forEach((s) => counts.set(s.mood, (counts.get(s.mood) ?? 0) + s.duration));
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    $("statMood").textContent = `Dominant mood: ${top}`;
  }
  $("timelineTotal").textContent = plan ? `${dur.toFixed(1)}s total` : "0.0s";
  const valid = !!plan && dur >= MIN_DURATION - 0.05 && dur <= MAX_DURATION + 0.05;
  $<HTMLButtonElement>("recordBtn").disabled = !valid || !plan;
  $<HTMLButtonElement>("playBtn").disabled = !plan;
  $<HTMLButtonElement>("addScene").disabled = !plan || plan.scenes.length >= 20;
  return { valid, dur };
}

// ---------- timeline ----------
function renderTimeline() {
  const el = $("bars");
  if (!plan) {
    el.innerHTML = `<p class="empty">Scenes will appear here once generated.</p>`;
    return;
  }
  const max = Math.max(...plan.scenes.map((s) => s.duration));
  el.innerHTML = "";
  plan.scenes.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "bar";
    b.dataset.i = String(i);
    const h = 30 + (s.duration / max) * 110;
    const kind = s.mood === "terror" ? "filled" : s.mood === "tension" ? "soft" : "";
    b.innerHTML = `<div class="pill ${kind}" style="height:${h}px"><em>${s.duration.toFixed(1)}s</em></div><b>S${i + 1}</b>`;
    b.title = `${s.visual} · ${s.mood}`;
    b.addEventListener("click", () => seekToScene(i));
    el.appendChild(b);
  });
  highlightCurrent();
}

function seekToScene(i: number) {
  if (!plan) return;
  const start = plan.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0);
  stopPlayback();
  drawAt(start + Math.min(1.2, plan.scenes[i].duration * 0.5));
}

let lastIdx = -1;
function highlightCurrent(force = false) {
  if (!plan) return;
  const idx = sceneAt(plan, currentTime)?.index ?? -1;
  if (idx === lastIdx && !force) return;
  lastIdx = idx;
  document.querySelectorAll<HTMLElement>(".bar").forEach((b) => b.classList.toggle("current", Number(b.dataset.i) === idx));
  document.querySelectorAll<HTMLElement>(".scene").forEach((b) => b.classList.toggle("current", Number(b.dataset.i) === idx));
}

// ---------- scene list ----------
function thumb(scene: Scene, i: number, target: HTMLCanvasElement) {
  // Render the scene at its real position so its seed (and look) matches the video.
  const p: StoryPlan = { title: "", scenes: plan ? plan.scenes.slice(0, i + 1) : [scene] };
  const start = p.scenes.slice(0, -1).reduce((a, s) => a + s.duration, 0);
  thumbRenderer.render(p, start + scene.duration * 0.6, { captionStyle, showTitle: false, captions: false, transitions: false });
  target.getContext("2d")!.drawImage(thumbCanvas, 0, 0);
}

function option(values: readonly string[], selected: string) {
  return values.map((v) => `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`).join("");
}

function renderScenes() {
  const list = $("sceneList");
  if (!plan) {
    list.innerHTML = `<p class="empty">Write a story and press <b>Generate short</b>.</p>`;
    return;
  }
  list.innerHTML = "";
  plan.scenes.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "scene";
    row.dataset.i = String(i);
    row.innerHTML = `
      <button class="thumb" type="button" title="Preview scene"><canvas width="108" height="192"></canvas><span>S${i + 1}</span></button>
      <div class="scene-body">
        <textarea rows="2" aria-label="Caption for scene ${i + 1}"></textarea>
        <div class="scene-meta">
          <span class="mood mood-${s.mood}">${s.mood}</span>
          <select data-k="visual" aria-label="Visual">${option(VISUALS, s.visual)}</select>
          <select data-k="mood" aria-label="Mood">${option(MOODS, s.mood)}</select>
          <input type="number" data-k="duration" min="1" max="20" step="0.5" value="${s.duration}" aria-label="Duration (seconds)" />
          <label class="icon-mini" data-icon="image" title="Use your own image">${s.image ? "Image ✓" : "Image"}<input type="file" accept="image/*" hidden /></label>
          <button class="icon-mini danger" type="button" data-icon="trash" title="Delete scene" aria-label="Delete scene"></button>
        </div>
        <details class="more">
          <summary>Sound &amp; effects · ${s.sfx.length + s.effects.length} active</summary>
          <p class="fx-label">Sound</p>
          <div class="sfx-chips" data-group="sfx">${SFX.map((x) => `<button type="button" class="sfx-chip${s.sfx.includes(x) ? " on" : ""}" data-v="${x}">${x}</button>`).join("")}</div>
          <p class="fx-label">Effects</p>
          <div class="sfx-chips" data-group="effects">${EFFECTS.map((x) => `<button type="button" class="sfx-chip${s.effects.includes(x) ? " on" : ""}" data-v="${x}">${x}</button>`).join("")}</div>
        </details>
      </div>`;
    const ta = row.querySelector("textarea")!;
    ta.value = s.text;
    ta.addEventListener("input", () => {
      s.text = ta.value;
      updateStats();
      redraw();
    });
    row.querySelector(".thumb")!.addEventListener("click", () => seekToScene(i));
    row.querySelectorAll<HTMLSelectElement | HTMLInputElement>("[data-k]").forEach((el) =>
      el.addEventListener("change", () => {
        const k = el.dataset.k!;
        if (k === "duration") s.duration = Math.min(20, Math.max(1, Number(el.value) || s.duration));
        else (s as any)[k] = el.value;
        afterPlanChange();
      }),
    );
    row.querySelector<HTMLInputElement>("input[type=file]")!.addEventListener("change", (e) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (!f) return;
      if (s.image) URL.revokeObjectURL(s.image);
      s.image = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => afterPlanChange();
      img.src = s.image;
    });
    row.querySelector(".danger")!.addEventListener("click", () => {
      if (!plan || plan.scenes.length <= 1) return toast("A short needs at least one scene.", true);
      plan.scenes.splice(i, 1);
      afterPlanChange();
    });
    row.querySelectorAll<HTMLElement>("[data-group]").forEach((group) =>
      group.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".sfx-chip");
        if (!btn) return;
        const key = group.dataset.group as "sfx" | "effects";
        const arr = s[key] as string[];
        const v = btn.dataset.v!;
        const at = arr.indexOf(v);
        if (at >= 0) arr.splice(at, 1);
        else arr.push(v);
        btn.classList.toggle("on", at < 0);
        row.querySelector("summary")!.innerHTML = `Sound &amp; effects · ${s.sfx.length + s.effects.length} active`;
        updateStats();
        redraw();
        if (key === "effects") thumb(s, i, row.querySelector(".thumb canvas")!);
      }),
    );
    list.appendChild(row);
    thumb(s, i, row.querySelector(".thumb canvas")!);
  });
  highlightCurrent(true);
}

function afterPlanChange() {
  if (!plan) return;
  plan.scenes.forEach((s, i) => (s.id = `s${i + 1}`));
  invalidateRecording();
  renderScenes();
  renderTimeline();
  const { valid, dur } = updateStats();
  if (!valid) toast(`Total length is ${dur.toFixed(1)}s — keep it between ${MIN_DURATION} and ${MAX_DURATION}s to render.`, true);
  redraw();
}

$("addScene").addEventListener("click", () => {
  if (!plan) return;
  plan.scenes.push({
    id: "",
    text: "And then it was right behind me.",
    visual: "figure",
    mood: "terror",
    duration: 3,
    effects: ["zoom", "shake"],
    sfx: ["stinger"],
  });
  afterPlanChange();
});

// ---------- preview ----------
function drawAt(t: number) {
  if (!plan) return;
  currentTime = Math.max(0, Math.min(t, totalDuration(plan)));
  renderer.render(plan, currentTime, opts());
  onTime(currentTime, totalDuration(plan));
}
function redraw() {
  if (plan && !player?.playing) drawAt(currentTime);
}

function onTime(t: number, total: number) {
  currentTime = t;
  $("clock").innerHTML = `${fmt(t)}<span>/ ${fmt(total)}</span>`;
  $<HTMLInputElement>("scrub").value = String(Math.round((t / Math.max(total, 0.01)) * 1000));
  highlightCurrent();
  if (isRecording) setGauge(t / total, "Rendering…");
}

function setPlaying(on: boolean) {
  const b = $("playBtn");
  b.dataset.icon = on ? "stop" : "play";
  b.setAttribute("aria-label", on ? "Stop" : "Play");
  const live = $("liveBadge");
  live.textContent = isRecording ? "● REC" : on ? "Playing" : "Ready";
  live.classList.toggle("on", isRecording);
}

function stopPlayback() {
  player?.stop();
  setPlaying(false);
}

$("playBtn").addEventListener("click", async () => {
  if (!plan || isRecording) return;
  const p = getPlayer();
  if (p.playing) return stopPlayback();
  setPlaying(true);
  await p.play(plan, opts(), mix(), currentTime);
  setPlaying(false);
});

$<HTMLInputElement>("scrub").addEventListener("input", (e) => {
  if (!plan || isRecording) return;
  stopPlayback();
  drawAt((+(e.target as HTMLInputElement).value / 1000) * totalDuration(plan));
});

// ---------- generate ----------
async function generate() {
  const story = storyInput.value.trim();
  if (words(story) < 5) {
    storyInput.focus();
    return toast("Write at least a sentence or two first.", true);
  }
  const btn = $<HTMLButtonElement>("generateBtn");
  btn.classList.add("loading");
  stopPlayback();
  const useAi = $<HTMLInputElement>("useAi").checked;
  let source = "local";
  try {
    const r = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ story, duration: target, title: titleInput.value, useAi }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    const data = await r.json();
    plan = data.plan;
    source = data.source;
  } catch (err) {
    console.warn("Server planner unavailable, planning in the browser", err);
    plan = planLocally(story, target, titleInput.value);
  } finally {
    btn.classList.remove("loading");
  }
  if (!plan) return;
  if (!titleInput.value) titleInput.value = plan.title;
  $("screenEmpty").hidden = true;
  currentTime = 0;
  afterPlanChange();
  drawAt(1.2);
  toast(source === "ai" ? `Claude directed ${plan.scenes.length} scenes. Press play!` : `Planned ${plan.scenes.length} scenes. Press play!`);
  document.getElementById("export")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
$("generateBtn").addEventListener("click", generate);

$("sampleBtn").addEventListener("click", () => {
  const s = SAMPLES[sampleIdx++ % SAMPLES.length];
  storyInput.value = s.story;
  titleInput.value = s.title;
  updateStats();
  storyInput.focus();
});

// ---------- options ----------
storyInput.addEventListener("input", updateStats);
titleInput.addEventListener("input", () => {
  if (plan) {
    plan.title = titleInput.value;
    invalidateRecording();
    redraw();
  }
});

$("durationInput").addEventListener("input", (e) => {
  target = +(e.target as HTMLInputElement).value;
  $("durationValue").textContent = String(target);
  if (plan) {
    plan.scenes = fitDurations(plan.scenes, target);
    afterPlanChange();
  } else updateStats();
});

$("captionStyle").addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button");
  if (!b) return;
  captionStyle = b.dataset.value as CaptionStyle;
  document.querySelectorAll("#captionStyle button").forEach((x) => x.classList.toggle("on", x === b));
  invalidateRecording();
  redraw();
});
$("titleCard").addEventListener("change", () => {
  invalidateRecording();
  redraw();
});
for (const id of ["musicVol", "sfxVol"]) {
  $(id).addEventListener("input", (e) => {
    $(id === "musicVol" ? "musicOut" : "sfxOut").textContent = `${(e.target as HTMLInputElement).value}%`;
    invalidateRecording();
  });
}
$("quality").addEventListener("change", (e) => {
  const q = +(e.target as HTMLSelectElement).value;
  canvas.width = q;
  canvas.height = Math.round((q * 16) / 9);
  invalidateRecording();
  redraw();
});
canvas.width = 720;
canvas.height = 1280;

document.querySelectorAll<HTMLAnchorElement>(".nav a[href^='#']").forEach((a) =>
  a.addEventListener("click", () => {
    document.querySelectorAll(".nav a").forEach((x) => x.classList.toggle("active", x === a));
  }),
);

// ---------- export ----------
function setGauge(frac: number, label: string) {
  const pct = Math.round(Math.min(1, Math.max(0, frac)) * 100);
  $("gaugeFill").style.strokeDasharray = `${pct} 100`;
  $("gaugePct").textContent = `${pct}%`;
  $("gaugeText").textContent = label;
}

function invalidateRecording() {
  if (!recording) return;
  URL.revokeObjectURL(recording.url);
  recording = null;
  const dl = $<HTMLAnchorElement>("downloadBtn");
  dl.classList.add("disabled");
  dl.removeAttribute("href");
  dl.textContent = "Download video";
  $("convertBtn").hidden = true;
  setGauge(0, "Changed — render again");
}

let cancelled = false;
$("recordBtn").addEventListener("click", async () => {
  if (!plan) return;
  const p = getPlayer();
  if (isRecording) {
    cancelled = true;
    p.stop();
    return;
  }
  stopPlayback();
  invalidateRecording();
  cancelled = false;
  isRecording = true;
  const rb = $("recordBtn");
  rb.dataset.icon = "stop";
  rb.setAttribute("aria-label", "Cancel render");
  $<HTMLButtonElement>("playBtn").disabled = true;
  $<HTMLButtonElement>("generateBtn").disabled = true;
  setPlaying(true);
  setGauge(0, "Rendering…");
  try {
    const rec = await p.record(plan, opts(), mix());
    if (cancelled) {
      setGauge(0, "Render cancelled");
    } else {
      recording = { ...rec, url: URL.createObjectURL(rec.blob) };
      const dl = $<HTMLAnchorElement>("downloadBtn");
      dl.href = recording.url;
      dl.download = `${slug(plan.title)}.${rec.ext}`;
      dl.textContent = `Download .${rec.ext} · ${(rec.blob.size / 1e6).toFixed(1)} MB`;
      dl.classList.remove("disabled");
      $("convertBtn").hidden = !(rec.ext === "webm" && health.ffmpeg);
      setGauge(1, "Ready to download");
      toast("Your short is ready!");
    }
  } catch (err) {
    console.error(err);
    setGauge(0, "Render failed");
    toast((err as Error).message, true);
  } finally {
    isRecording = false;
    rb.dataset.icon = "rec";
    rb.setAttribute("aria-label", "Render video");
    $<HTMLButtonElement>("generateBtn").disabled = false;
    setPlaying(false);
    updateStats();
  }
});

$("convertBtn").addEventListener("click", async () => {
  if (!recording || !plan) return;
  const btn = $<HTMLButtonElement>("convertBtn");
  btn.classList.add("loading");
  btn.textContent = "Converting";
  try {
    const fd = new FormData();
    fd.append("video", recording.blob, "video.webm");
    const r = await fetch("/api/convert", { method: "POST", body: fd });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(plan.title)}.mp4`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toast("MP4 downloaded.");
  } catch (err) {
    toast(`Conversion failed: ${(err as Error).message}`, true);
  } finally {
    btn.classList.remove("loading");
    btn.textContent = "Convert to MP4";
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && isRecording) toast("Keep this tab visible while rendering, or frames will be dropped.", true);
});

updateStats();
