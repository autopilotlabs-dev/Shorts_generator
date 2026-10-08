// Composites a full video frame for any timestamp of a StoryPlan.
// Runs in the browser (live preview) and in Node via @napi-rs/canvas (final render).
import type { CaptionStyle, Scene, StoryPlan } from "./types";
import { clamp01, ease, H, lerp, noise1, rng, sceneSeed, strikeTimes, W, type Ctx } from "./util";
import { hexA, paintImage, PAINTERS, PALETTES, type PaintArgs } from "./visuals";

export type { CaptionStyle };

/** Minimal canvas surface shared by HTMLCanvasElement and @napi-rs/canvas. */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: "2d"): unknown;
}

/** Anything drawImage() accepts: an <img>, an ImageBitmap or a napi Image. */
export type Drawable = { width: number; height: number };

export interface Platform {
  createCanvas(w: number, h: number): CanvasLike;
  /** Returns a ready-to-draw image for a URL, or null while it is still loading. */
  image(src: string): Drawable | null;
}

export const FONT_FAMILIES = {
  oswald: "Oswald",
  typewriter: "Special Elite",
  creepy: "Creepster",
  ui: "Plus Jakarta Sans",
};

/** Active-word caption colour. */
const HIGHLIGHT = "#ff2e47";

export interface RenderOptions {
  captionStyle: CaptionStyle;
  showTitle: boolean;
  /** Defaults to true; thumbnails turn captions and fades off. */
  captions?: boolean;
  transitions?: boolean;
  /** Film grain overlay. The server renderer turns this off and adds grain in ffmpeg instead. */
  grain?: boolean;
}

const CAPTION_FONTS: Record<CaptionStyle, { family: string; size: number; upper: boolean }> = {
  bold: { family: "Oswald, Impact, sans-serif", size: 78, upper: true },
  typewriter: { family: "'Special Elite', 'Courier New', monospace", size: 62, upper: false },
  creepy: { family: "Creepster, Oswald, sans-serif", size: 84, upper: true },
};

export interface SceneAt {
  scene: Scene;
  index: number;
  start: number;
  local: number;
}

export function sceneAt(plan: StoryPlan, time: number): SceneAt | null {
  let start = 0;
  for (let i = 0; i < plan.scenes.length; i++) {
    const s = plan.scenes[i];
    if (time < start + s.duration || i === plan.scenes.length - 1) {
      return { scene: s, index: i, start, local: Math.min(s.duration, Math.max(0, time - start)) };
    }
    start += s.duration;
  }
  return null;
}

const ctxOf = (c: CanvasLike) => c.getContext("2d") as Ctx;

export class Renderer {
  private grain: CanvasLike[] = [];
  private scratch: CanvasLike;

  constructor(
    private canvas: CanvasLike,
    private platform: Platform,
  ) {
    for (let i = 0; i < 4; i++) this.grain.push(makeGrain(platform.createCanvas(270, 480), i));
    this.scratch = platform.createCanvas(canvas.width, canvas.height);
  }

  render(plan: StoryPlan, time: number, opts: RenderOptions) {
    const ctx = ctxOf(this.canvas);
    const k = this.canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    const at = sceneAt(plan, time);
    if (!at) return;
    const { scene, index, local } = at;
    const u = clamp01(local / scene.duration);
    const seed = sceneSeed(scene.id, scene.visual, index);
    const pal = PALETTES[scene.mood];
    const fx = new Set(scene.effects);
    const args: PaintArgs = { t: local, u, seed, pal, text: scene.text };

    // --- camera ---
    ctx.save();
    let zoom = fx.has("zoom") ? lerp(1.02, 1.14, ease(u)) : 1.02;
    let sx = 0;
    let sy = 0;
    if (fx.has("shake")) {
      const amp = lerp(4, 22, u);
      sx = noise1(local * 14, seed) * amp;
      sy = noise1(local * 14, seed + 1) * amp;
    }
    // jolt at the start of a terror scene
    if (scene.mood === "terror" && local < 0.35) zoom += (0.35 - local) * 0.25;
    ctx.translate(W / 2 + sx, H / 2 + sy);
    ctx.scale(zoom, zoom);
    ctx.translate(-W / 2, -H / 2);

    const img = scene.image ? this.platform.image(scene.image) : null;
    if (img) paintImage(ctx, img, args);
    else PAINTERS[scene.visual](ctx, args);

    if (fx.has("fog")) fog(ctx, local, seed);
    if (fx.has("dust")) dust(ctx, local, seed);
    if (fx.has("rain")) rain(ctx, local, seed);
    ctx.restore();

    // --- lighting & post ---
    if (fx.has("lightning")) lightning(ctx, local, scene.duration, seed);
    if (fx.has("flicker")) {
      const f = noise1(local * 11, seed + 3);
      if (f < -0.35) {
        ctx.fillStyle = `rgba(0,0,0,${Math.min(0.85, (-f - 0.35) * 2.2)})`;
        ctx.fillRect(0, 0, W, H);
      }
    }
    vignette(ctx, scene.mood === "terror" ? 0.75 : 0.55);
    if (opts.grain !== false) this.drawGrain(ctx, time);

    if (opts.captions !== false) captions(ctx, scene, local, opts.captionStyle, HIGHLIGHT);
    if (opts.showTitle && index === 0) title(ctx, plan.title, time, pal.accent);

    if (fx.has("glitch")) this.glitch(ctx, local, seed);

    // --- transitions ---
    if (opts.transitions === false) return;
    const fadeIn = index === 0 ? 0.6 : 0.3;
    let black = 0;
    if (local < fadeIn) black = 1 - local / fadeIn;
    const total = plan.scenes.reduce((a, s) => a + s.duration, 0);
    if (index === plan.scenes.length - 1 && time > total - 0.7) black = Math.max(black, (time - (total - 0.7)) / 0.7);
    else if (scene.duration - local < 0.18) black = Math.max(black, 1 - (scene.duration - local) / 0.18);
    if (black > 0) {
      ctx.fillStyle = `rgba(0,0,0,${clamp01(black)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  private drawGrain(ctx: Ctx, time: number) {
    const g = this.grain[Math.floor(time * 24) % this.grain.length];
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.globalCompositeOperation = "screen";
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(g as CanvasImageSource, 0, 0, W, H);
    ctx.restore();
  }

  /** Short bursts of slice displacement + red/cyan split. */
  private glitch(ctx: Ctx, local: number, seed: number) {
    const burst = (Math.sin(local * 2.3 + seed) > 0.82 ? 1 : 0) || (local < 0.25 ? 1 : 0);
    if (!burst) return;
    const c = this.canvas;
    const s = this.scratch;
    if (s.width !== c.width || s.height !== c.height) {
      s.width = c.width;
      s.height = c.height;
    }
    const sctx = ctxOf(s);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.drawImage(c as CanvasImageSource, 0, 0);
    const k = c.width / W;
    const r = rng(Math.floor(local * 20) + seed);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 9; i++) {
      const y = r() * c.height;
      const h = (8 + r() * 70) * k;
      const dx = (r() - 0.5) * 120 * k;
      ctx.drawImage(s as CanvasImageSource, 0, y, c.width, h, dx, y, c.width, h);
    }
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.35;
    ctx.drawImage(s as CanvasImageSource, 10 * k, 0);
    ctx.restore();
  }
}

// ---------- effects ----------

function makeGrain(c: CanvasLike, seed: number): CanvasLike {
  const w = c.width;
  const h = c.height;
  const ctx = ctxOf(c);
  const data = ctx.createImageData(w, h);
  const r = rng(seed + 1000);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = r() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

function vignette(ctx: Ctx, strength: number) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function fog(ctx: Ctx, t: number, seed: number) {
  const r = rng(seed + 77);
  for (let i = 0; i < 10; i++) {
    const y = H * (0.55 + r() * 0.45);
    const speed = 15 + r() * 40;
    const x = ((r() * W * 2 + t * speed * (i % 2 ? 1 : -1)) % (W * 2) + W * 2) % (W * 2) - W * 0.5;
    const rad = 300 + r() * 400;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(200,205,215,0.13)");
    g.addColorStop(1, "rgba(200,205,215,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

function dust(ctx: Ctx, t: number, seed: number) {
  const r = rng(seed + 55);
  ctx.fillStyle = "rgba(255,240,210,0.35)";
  for (let i = 0; i < 60; i++) {
    const x = (r() * W + noise1(t * 0.3 + i, 9) * 80 + W) % W;
    const y = (r() * H - t * (8 + r() * 20) + H) % H;
    const s = 1 + r() * 3;
    ctx.fillRect(x, y, s, s);
  }
}

function rain(ctx: Ctx, t: number, seed: number) {
  const r = rng(seed + 33);
  ctx.strokeStyle = "rgba(180,200,230,0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 220; i++) {
    const speed = 1400 + r() * 900;
    const x = (r() * (W + 300) + t * 220) % (W + 300) - 150;
    const y = (r() * H + t * speed) % (H + 100) - 50;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 14, y - 46);
  }
  ctx.stroke();
}

function lightning(ctx: Ctx, local: number, dur: number, seed: number) {
  for (const s of strikeTimes(dur, seed)) {
    const d = local - s;
    if (d >= 0 && d < 0.4) {
      const a = d < 0.06 ? 0.85 : d < 0.12 ? 0.15 : d < 0.18 ? 0.6 : 0.6 * (1 - (d - 0.18) / 0.22);
      ctx.fillStyle = `rgba(220,230,255,${Math.max(0, a)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }
}

// ---------- typography ----------

function wrap(ctx: Ctx, words: string[], maxW: number): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    const test = [...cur, w].join(" ");
    if (cur.length && ctx.measureText(test).width > maxW) {
      lines.push(cur);
      cur = [w];
    } else cur.push(w);
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/** Split caption words into short "pages" (TikTok style), breaking at sentence ends. */
export function captionPages(words: string[], maxWords = 5): string[][] {
  const pages: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= maxWords || /[.!?…]["'”’]?$/.test(w)) {
      pages.push(cur);
      cur = [];
    }
  }
  if (cur.length) pages.push(cur);
  return pages;
}

function captions(ctx: Ctx, scene: Scene, local: number, style: CaptionStyle, accent: string) {
  const font = CAPTION_FONTS[style];
  const raw = scene.text.trim().split(/\s+/).filter(Boolean);
  if (!raw.length) return;
  const words = font.upper ? raw.map((w) => w.toUpperCase()) : raw;

  // Words are spoken across the scene (minus a short lead-in/out); each word
  // gets time proportional to its length so long words linger a bit.
  const lead = Math.min(0.25, scene.duration * 0.08);
  const span = Math.max(0.4, scene.duration - lead - 0.2);
  const weights = words.map((w) => 1 + w.length * 0.12);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  let acc = lead;
  for (const w of weights) {
    starts.push(acc);
    acc += (w / totalW) * span;
  }
  let current = 0;
  for (let i = 0; i < words.length; i++) if (local >= starts[i]) current = i;

  const pages = captionPages(words);
  let first = 0;
  let page = pages[0];
  for (const p of pages) {
    if (current < first + p.length) {
      page = p;
      break;
    }
    first += p.length;
  }

  let size = font.size * 1.2;
  ctx.font = `${size}px ${font.family}`;
  let lines = wrap(ctx, page, W * 0.82);
  while ((lines.length > 2 || lines.some((l) => ctx.measureText(l.join(" ")).width > W * 0.86)) && size > 48) {
    size -= 6;
    ctx.font = `${size}px ${font.family}`;
    lines = wrap(ctx, page, W * 0.82);
  }
  const lineH = size * 1.18;
  const top = H * 0.64 - (lines.length * lineH) / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  let wi = first;
  lines.forEach((line, li) => {
    const lineW = ctx.measureText(line.join(" ")).width;
    let x = (W - lineW) / 2;
    const y = top + (li + 0.8) * lineH;
    for (const w of line) {
      const shown = clamp01((local - starts[wi]) / 0.1);
      const ww = ctx.measureText(w + " ").width;
      if (shown > 0) {
        const active = wi === current;
        const cx = x + ctx.measureText(w).width / 2;
        const cy = y - size * 0.35;
        const pop = active ? 1 + 0.12 * (1 - clamp01((local - starts[wi]) / 0.15)) + 0.04 : 1;
        ctx.save();
        ctx.globalAlpha = shown;
        ctx.translate(cx, cy);
        ctx.scale(pop, pop);
        ctx.translate(-cx, -cy);
        ctx.lineWidth = size * 0.18;
        ctx.strokeStyle = "rgba(0,0,0,0.92)";
        ctx.strokeText(w, x, y);
        ctx.fillStyle = active ? accent : "#f4f1ea";
        if (active) {
          ctx.shadowColor = accent;
          ctx.shadowBlur = 28;
        }
        ctx.fillText(w, x, y);
        ctx.restore();
      }
      x += ww;
      wi++;
    }
  });
}

function title(ctx: Ctx, text: string, time: number, accent: string) {
  const dur = 2.4;
  if (time > dur || !text) return;
  const a = time < 0.3 ? time / 0.3 : time > dur - 0.5 ? (dur - time) / 0.5 : 1;
  ctx.save();
  ctx.globalAlpha = clamp01(a);
  ctx.textAlign = "center";
  let size = 120;
  ctx.font = `${size}px Creepster, Oswald, sans-serif`;
  while (ctx.measureText(text.toUpperCase()).width > W * 0.88 && size > 60) {
    size -= 6;
    ctx.font = `${size}px Creepster, Oswald, sans-serif`;
  }
  const jitter = noise1(time * 20, 4) * 3;
  ctx.shadowColor = accent;
  ctx.shadowBlur = 40;
  ctx.fillStyle = accent;
  ctx.fillText(text.toUpperCase(), W / 2 + jitter, H * 0.2);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#f4f1ea";
  ctx.font = `600 30px 'Plus Jakarta Sans', sans-serif`;
  ctx.fillText("A SHORT HORROR STORY", W / 2, H * 0.2 + 70);
  ctx.restore();
}
