// Procedural, animated horror backdrops. Every painter draws a full 1080x1920
// frame for scene-local time `t` (seconds) and progress `u` (0..1).
import type { Mood, Visual } from "./types";
import { clamp01, ease, H, lerp, noise1, rng, W, type Ctx } from "./util";

export interface Palette {
  skyTop: string;
  skyBottom: string;
  glow: string; // moon / light colour
  accent: string; // highlights, eyes
  ground: string;
}

export const PALETTES: Record<Mood, Palette> = {
  dread: { skyTop: "#05070c", skyBottom: "#1b2333", glow: "#c9d3e6", accent: "#e8e2c8", ground: "#030405" },
  tension: { skyTop: "#020806", skyBottom: "#132a24", glow: "#b8e0c8", accent: "#d6ffd9", ground: "#010302" },
  terror: { skyTop: "#0a0101", skyBottom: "#3a0707", glow: "#ff9a8a", accent: "#ff2b2b", ground: "#050000" },
  eerie: { skyTop: "#07040d", skyBottom: "#2a1838", glow: "#d9c6f5", accent: "#f2e6ff", ground: "#030106" },
  sad: { skyTop: "#03060a", skyBottom: "#16263a", glow: "#a9c4e8", accent: "#dfeaff", ground: "#020305" },
};

export interface PaintArgs {
  t: number;
  u: number;
  seed: number;
  pal: Palette;
  text: string;
}

type Painter = (ctx: Ctx, a: PaintArgs) => void;

// ---------- shared pieces ----------

function sky(ctx: Ctx, pal: Palette, horizon = H) {
  const g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, pal.skyTop);
  g.addColorStop(1, pal.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function stars(ctx: Ctx, a: PaintArgs, count = 90, maxY = H * 0.55) {
  const r = rng(a.seed + 11);
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const y = r() * maxY;
    const tw = 0.5 + 0.5 * Math.sin(a.t * (1 + r() * 3) + i);
    ctx.fillStyle = `rgba(255,255,255,${0.15 + 0.5 * tw * r()})`;
    ctx.fillRect(x, y, 2, 2);
  }
}

function moon(ctx: Ctx, a: PaintArgs, x: number, y: number, rad: number) {
  const glow = ctx.createRadialGradient(x, y, rad * 0.6, x, y, rad * 4);
  glow.addColorStop(0, hexA(a.pal.glow, 0.35));
  glow.addColorStop(1, hexA(a.pal.glow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x - rad * 4, y - rad * 4, rad * 8, rad * 8);
  ctx.fillStyle = a.pal.glow;
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fill();
  // craters
  const r = rng(a.seed + 3);
  ctx.fillStyle = "rgba(0,0,0,0.08)";
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x + (r() - 0.5) * rad, y + (r() - 0.5) * rad, rad * (0.08 + r() * 0.15), 0, Math.PI * 2);
    ctx.fill();
  }
}

function clouds(ctx: Ctx, a: PaintArgs, y: number, alpha = 0.55) {
  const r = rng(a.seed + 21);
  for (let i = 0; i < 7; i++) {
    const speed = 12 + r() * 25;
    const cx = ((r() * W * 1.6 + a.t * speed) % (W * 1.6)) - W * 0.3;
    const cy = y + (r() - 0.5) * 260;
    const w = 260 + r() * 360;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w);
    g.addColorStop(0, `rgba(8,8,12,${alpha})`);
    g.addColorStop(1, "rgba(8,8,12,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w, w * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Recursive bare branch. */
function branch(ctx: Ctx, x: number, y: number, len: number, ang: number, w: number, depth: number, r: () => number, sway: number) {
  if (depth === 0 || len < 8) return;
  const nx = x + Math.cos(ang) * len;
  const ny = y + Math.sin(ang) * len;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(nx, ny);
  ctx.stroke();
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    branch(ctx, nx, ny, len * (0.6 + r() * 0.2), ang + (r() - 0.5) * 1.3 + sway, w * 0.65, depth - 1, r, sway);
  }
}

function deadTree(ctx: Ctx, x: number, baseY: number, h: number, seed: number, t: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const sway = noise1(t * 0.4, seed) * 0.05;
  branch(ctx, x, baseY, h * 0.35, -Math.PI / 2 + sway, h * 0.06, 6, rng(seed), sway);
}

function hill(ctx: Ctx, y: number, amp: number, color: string, seed: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 30) ctx.lineTo(x, y + noise1(x / 260, seed) * amp);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
}

/** Tall, thin humanoid silhouette with optional glowing eyes. */
export function silhouette(ctx: Ctx, cx: number, footY: number, height: number, t: number, eyes: number, eyeColor: string) {
  const s = height / 1000;
  const sway = Math.sin(t * 0.9) * 6 * s;
  ctx.save();
  ctx.translate(cx + sway, footY);
  ctx.scale(s, s);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  // head
  ctx.ellipse(0, -900, 55, 72, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.beginPath();
  ctx.moveTo(-40, -830);
  ctx.quadraticCurveTo(-130, -790, -120, -560);
  ctx.lineTo(-150, -230); // long arm
  ctx.lineTo(-125, -225);
  ctx.lineTo(-95, -520);
  ctx.lineTo(-80, -380);
  ctx.lineTo(-70, 0);
  ctx.lineTo(-20, 0);
  ctx.lineTo(0, -360);
  ctx.lineTo(20, 0);
  ctx.lineTo(70, 0);
  ctx.lineTo(80, -380);
  ctx.lineTo(95, -520);
  ctx.lineTo(125, -225);
  ctx.lineTo(150, -230);
  ctx.lineTo(120, -560);
  ctx.quadraticCurveTo(130, -790, 40, -830);
  ctx.closePath();
  ctx.fill();
  if (eyes > 0) {
    ctx.shadowColor = eyeColor;
    ctx.shadowBlur = 30;
    ctx.fillStyle = hexA(eyeColor, eyes);
    ctx.beginPath();
    ctx.ellipse(-22, -905, 10, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(22, -905, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function eyePair(ctx: Ctx, x: number, y: number, size: number, open: number, color: string, alpha: number) {
  if (open <= 0.02 || alpha <= 0) return;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 2.5;
  ctx.fillStyle = hexA(color, alpha);
  for (const dx of [-size * 1.6, size * 1.6]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y, size, size * 0.55 * open, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  for (const dx of [-size * 1.6, size * 1.6]) {
    ctx.beginPath();
    ctx.ellipse(x + dx, y, size * 0.18, size * 0.45 * open, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function blinkAt(t: number, phase: number): number {
  const p = (t + phase) % 3.7;
  return p < 0.15 ? Math.abs(p - 0.075) / 0.075 : 1;
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ---------- painters ----------

const moonScene: Painter = (ctx, a) => {
  sky(ctx, a.pal);
  stars(ctx, a, 140);
  moon(ctx, a, W * 0.62, H * 0.3 - a.u * 40, 170);
  clouds(ctx, a, H * 0.3);
  hill(ctx, H * 0.78, 50, a.pal.ground, a.seed);
  deadTree(ctx, W * 0.24, H * 0.8, 1100, a.seed + 5, a.t, a.pal.ground);
};

const forest: Painter = (ctx, a) => {
  sky(ctx, a.pal);
  moon(ctx, a, W * 0.5, H * 0.22, 90);
  const layers = [
    { n: 14, w: 26, shade: 0.55, y: H * 0.72 },
    { n: 9, w: 46, shade: 0.75, y: H * 0.82 },
    { n: 5, w: 90, shade: 1, y: H * 0.95 },
  ];
  layers.forEach((L, li) => {
    const r = rng(a.seed + li * 99);
    ctx.fillStyle = `rgba(0,0,0,${L.shade})`;
    ctx.fillRect(0, L.y, W, H - L.y);
    for (let i = 0; i < L.n; i++) {
      const x = r() * W + (li + 1) * a.u * 40 * (r() > 0.5 ? 1 : -1);
      const sway = noise1(a.t * 0.5 + i, li) * 12 * (li + 1) * 0.3;
      const w = L.w * (0.7 + r() * 0.6);
      ctx.beginPath();
      ctx.moveTo(x - w / 2, L.y + 20);
      ctx.lineTo(x - w / 4 + sway, -50);
      ctx.lineTo(x + w / 4 + sway, -50);
      ctx.lineTo(x + w / 2, L.y + 20);
      ctx.fill();
      ctx.strokeStyle = `rgba(0,0,0,${L.shade})`;
      ctx.lineCap = "round";
      const br = rng(a.seed + i * 7 + li);
      for (let b = 0; b < 4; b++) {
        const by = L.y * (0.2 + br() * 0.6);
        const dir = br() > 0.5 ? 1 : -1;
        ctx.lineWidth = w * 0.18;
        ctx.beginPath();
        ctx.moveTo(x + sway * (1 - by / L.y), by);
        ctx.lineTo(x + dir * (80 + br() * 120) * (li + 1) * 0.5 + sway, by - 60 - br() * 90);
        ctx.stroke();
      }
    }
  });
  // distant lantern
  const flick = 0.6 + 0.4 * noise1(a.t * 6, a.seed);
  const g = ctx.createRadialGradient(W * 0.66, H * 0.7, 0, W * 0.66, H * 0.7, 120);
  g.addColorStop(0, `rgba(255,190,110,${0.5 * flick})`);
  g.addColorStop(1, "rgba(255,190,110,0)");
  ctx.fillStyle = g;
  ctx.fillRect(W * 0.66 - 120, H * 0.7 - 120, 240, 240);
};

const house: Painter = (ctx, a) => {
  sky(ctx, a.pal);
  stars(ctx, a, 80);
  moon(ctx, a, W * 0.78, H * 0.18, 80);
  clouds(ctx, a, H * 0.2, 0.4);
  hill(ctx, H * 0.7, 30, "#06070a", a.seed);
  ctx.fillStyle = "#020203";
  const bx = W * 0.18;
  const by = H * 0.42;
  const bw = W * 0.64;
  const bh = H * 0.32;
  ctx.fillRect(bx, by, bw, bh);
  // roofs + tower
  ctx.beginPath();
  ctx.moveTo(bx - 40, by);
  ctx.lineTo(bx + bw * 0.3, by - 230);
  ctx.lineTo(bx + bw * 0.6, by);
  ctx.moveTo(bx + bw * 0.45, by);
  ctx.lineTo(bx + bw * 0.8, by - 180);
  ctx.lineTo(bx + bw + 40, by);
  ctx.fill();
  ctx.fillRect(bx + bw * 0.72, by - 360, 110, 360);
  ctx.beginPath();
  ctx.moveTo(bx + bw * 0.72 - 20, by - 360);
  ctx.lineTo(bx + bw * 0.72 + 55, by - 520);
  ctx.lineTo(bx + bw * 0.72 + 130, by - 360);
  ctx.fill();
  // windows
  const r = rng(a.seed);
  const lit = Math.floor(r() * 6);
  for (let i = 0; i < 6; i++) {
    const wx = bx + 60 + (i % 3) * (bw / 3);
    const wy = by + 70 + Math.floor(i / 3) * 260;
    if (i === lit) {
      const f = 0.65 + 0.35 * noise1(a.t * 5, a.seed);
      ctx.fillStyle = `rgba(255,200,120,${f})`;
      ctx.fillRect(wx, wy, 110, 170);
      if (a.u > 0.45) {
        ctx.globalAlpha = ease(clamp01((a.u - 0.45) * 3));
        silhouette(ctx, wx + 55, wy + 170, 190, a.t, 0, a.pal.accent);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.fillStyle = "rgba(60,70,90,0.18)";
      ctx.fillRect(wx, wy, 110, 170);
    }
  }
  hill(ctx, H * 0.78, 20, a.pal.ground, a.seed + 1);
  deadTree(ctx, W * 0.9, H * 0.82, 900, a.seed + 9, a.t, a.pal.ground);
};

const hallway: Painter = (ctx, a) => {
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, W, H);
  const vx = W / 2;
  const vy = H * 0.46;
  const ex = 120; // end rectangle half-width
  const ey = 190;
  const light = 0.55 + 0.45 * Math.max(0, noise1(a.t * 8, a.seed));
  const wallCol = (k: number) => `rgba(${70 * k},${62 * k},${52 * k},1)`;
  // floor, ceiling, walls as trapezoids
  const quads: [number[], number][] = [
    [[0, 0, W, 0, vx + ex, vy - ey, vx - ex, vy - ey], 0.35],
    [[0, H, W, H, vx + ex, vy + ey, vx - ex, vy + ey], 0.5],
    [[0, 0, vx - ex, vy - ey, vx - ex, vy + ey, 0, H], 0.7],
    [[W, 0, vx + ex, vy - ey, vx + ex, vy + ey, W, H], 0.6],
  ];
  for (const [p, k] of quads) {
    ctx.fillStyle = wallCol(k * light);
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
    ctx.closePath();
    ctx.fill();
  }
  // depth fade
  const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, H * 0.6);
  g.addColorStop(0, "rgba(0,0,0,0.95)");
  g.addColorStop(0.35, "rgba(0,0,0,0.4)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // doors along walls
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  for (const d of [0.15, 0.4, 0.62]) {
    for (const side of [-1, 1]) {
      const x1 = lerp(side < 0 ? 0 : W, side < 0 ? vx - ex : vx + ex, d);
      const x2 = lerp(side < 0 ? 0 : W, side < 0 ? vx - ex : vx + ex, d + 0.12);
      const top1 = lerp(H * 0.12, vy - ey * 0.7, d);
      const top2 = lerp(H * 0.12, vy - ey * 0.7, d + 0.12);
      const bot1 = lerp(H, vy + ey, d);
      const bot2 = lerp(H, vy + ey, d + 0.12);
      ctx.beginPath();
      ctx.moveTo(x1, top1);
      ctx.lineTo(x2, top2);
      ctx.lineTo(x2, bot2);
      ctx.lineTo(x1, bot1);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(vx - ex, vy - ey, ex * 2, ey * 2);
  // figure at the end of the hall, slowly getting closer
  const size = lerp(260, 520, ease(a.u));
  silhouette(ctx, vx, vy + ey + size * 0.05, size, a.t, clamp01(a.u * 2 - 0.4), a.pal.accent);
  // ceiling bulb
  const bg = ctx.createRadialGradient(vx, H * 0.12, 0, vx, H * 0.12, 500);
  bg.addColorStop(0, `rgba(255,230,180,${0.35 * light})`);
  bg.addColorStop(1, "rgba(255,230,180,0)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
};

const figure: Painter = (ctx, a) => {
  sky(ctx, a.pal);
  const fogG = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, W);
  fogG.addColorStop(0, hexA(a.pal.glow, 0.28));
  fogG.addColorStop(1, hexA(a.pal.glow, 0));
  ctx.fillStyle = fogG;
  ctx.fillRect(0, 0, W, H);
  hill(ctx, H * 0.8, 15, a.pal.ground, a.seed);
  const size = lerp(700, 1500, ease(a.u));
  silhouette(ctx, W / 2, H * 0.82 + (size - 700) * 0.35, size, a.t, clamp01((a.u - 0.3) * 2), a.pal.accent);
};

const eyes: Painter = (ctx, a) => {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const r = rng(a.seed);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const x = 160 + r() * (W - 320);
    const y = 300 + r() * (H - 700);
    const size = 14 + r() * 26;
    const appear = i / n;
    const alpha = clamp01((a.u - appear * 0.8) * 4);
    eyePair(ctx, x, y, size, blinkAt(a.t, r() * 3), a.pal.accent, alpha * (0.5 + r() * 0.5));
  }
  // the big pair in the middle
  eyePair(ctx, W / 2, H * 0.45, 46, blinkAt(a.t, 1.3), a.pal.accent, clamp01(a.u * 1.6));
};

const graveyard: Painter = (ctx, a) => {
  sky(ctx, a.pal);
  stars(ctx, a, 70);
  moon(ctx, a, W * 0.3, H * 0.2, 110);
  clouds(ctx, a, H * 0.22, 0.45);
  hill(ctx, H * 0.66, 40, "#050608", a.seed);
  const r = rng(a.seed + 4);
  for (let row = 0; row < 3; row++) {
    const y = H * (0.7 + row * 0.08);
    const scale = 0.6 + row * 0.35;
    for (let i = 0; i < 5 - row; i++) {
      const x = (i + 0.5 + (r() - 0.5) * 0.5) * (W / (5 - row));
      const w = 110 * scale;
      const h = (150 + r() * 80) * scale;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((r() - 0.5) * 0.25);
      ctx.fillStyle = `rgb(${18 + row * 6},${19 + row * 6},${24 + row * 6})`;
      if (r() > 0.6) {
        ctx.fillRect(-w * 0.12, -h * 1.3, w * 0.24, h * 1.3);
        ctx.fillRect(-w * 0.45, -h * 1.0, w * 0.9, w * 0.22);
      } else {
        ctx.beginPath();
        ctx.moveTo(-w / 2, 0);
        ctx.lineTo(-w / 2, -h + w / 2);
        ctx.arc(0, -h + w / 2, w / 2, Math.PI, 0);
        ctx.lineTo(w / 2, 0);
        ctx.fill();
      }
      ctx.restore();
    }
  }
  deadTree(ctx, W * 0.82, H * 0.7, 1000, a.seed + 2, a.t, "#020203");
  hill(ctx, H * 0.93, 10, a.pal.ground, a.seed + 3);
  if (a.u > 0.55) silhouette(ctx, W * 0.6, H * 0.74, 300, a.t, 0.9, a.pal.accent);
};

const door: Painter = (ctx, a) => {
  ctx.fillStyle = "#16120f";
  ctx.fillRect(0, 0, W, H);
  // wallpaper stripes
  for (let x = 0; x < W; x += 90) {
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(x, 0, 30, H);
  }
  const dx = W * 0.22;
  const dy = H * 0.24;
  const dw = W * 0.56;
  const dh = H * 0.62;
  ctx.fillStyle = "#000";
  ctx.fillRect(dx, dy, dw, dh);
  // eyes in the gap
  const open = ease(clamp01(a.u * 1.2)) * 0.65;
  eyePair(ctx, dx + 70, dy + dh * 0.35, 16, blinkAt(a.t, 0.5), a.pal.accent, clamp01((open - 0.25) * 4));
  // the door leaf swinging inward (rendered as a narrowing quad)
  const leafW = dw * (1 - open);
  const skew = open * 90;
  ctx.fillStyle = "#3a2a1e";
  ctx.beginPath();
  ctx.moveTo(dx + dw - leafW, dy + skew * 0.4);
  ctx.lineTo(dx + dw, dy);
  ctx.lineTo(dx + dw, dy + dh);
  ctx.lineTo(dx + dw - leafW, dy + dh - skew * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.lineWidth = 8;
  for (const k of [0.12, 0.55]) {
    ctx.strokeRect(dx + dw - leafW * 0.88, dy + dh * k, leafW * 0.76, dh * 0.33);
  }
  ctx.fillStyle = "#b08d57";
  ctx.beginPath();
  ctx.arc(dx + dw - leafW * 0.88, dy + dh * 0.52, 14, 0, Math.PI * 2);
  ctx.fill();
  // frame
  ctx.strokeStyle = "#0b0806";
  ctx.lineWidth = 36;
  ctx.strokeRect(dx - 18, dy - 18, dw + 36, dh + 18);
  // light spill under door
  ctx.fillStyle = `rgba(255,120,80,${0.12 + 0.08 * Math.sin(a.t * 3)})`;
  ctx.fillRect(dx, dy + dh - 6, dw, 6);
  ctx.fillStyle = "#0a0807";
  ctx.fillRect(0, dy + dh, W, H - dy - dh);
};

const mirror: Painter = (ctx, a) => {
  ctx.fillStyle = "#121414";
  ctx.fillRect(0, 0, W, H);
  // tiles
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 3;
  for (let y = 0; y < H; y += 120) for (let x = 0; x < W; x += 120) ctx.strokeRect(x, y, 120, 120);
  const cx = W / 2;
  const cy = H * 0.42;
  ctx.fillStyle = "#2a2219";
  ctx.beginPath();
  ctx.ellipse(cx, cy, 360, 520, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, 320, 480, 0, 0, Math.PI * 2);
  ctx.clip();
  const mg = ctx.createLinearGradient(0, cy - 480, 0, cy + 480);
  mg.addColorStop(0, "#38403f");
  mg.addColorStop(1, "#151918");
  ctx.fillStyle = mg;
  ctx.fillRect(cx - 320, cy - 480, 640, 960);
  // reflection: viewer silhouette, then something behind it
  ctx.fillStyle = "rgba(0,0,0,0.85)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + 120, 120, 150, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 240, cy + 260, 480, 400);
  const face = clamp01((a.u - 0.25) * 2);
  if (face > 0) {
    ctx.globalAlpha = face;
    const fx = cx + 150 + noise1(a.t, a.seed) * 6;
    const fy = cy - 120;
    ctx.fillStyle = "#cfd2cb";
    ctx.beginPath();
    ctx.ellipse(fx, fy, 85, 120, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(fx - 30, fy - 20, 20, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(fx + 30, fy - 20, 20, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(fx, fy + 60, 26, 10 + 30 * face, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // glass sheen
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  ctx.beginPath();
  ctx.moveTo(cx - 300, cy - 300);
  ctx.lineTo(cx - 120, cy - 480);
  ctx.lineTo(cx - 40, cy - 480);
  ctx.lineTo(cx - 300, cy - 160);
  ctx.fill();
  ctx.restore();
  // sink
  ctx.fillStyle = "#d8d8d2";
  ctx.fillRect(W * 0.2, H * 0.78, W * 0.6, 50);
  ctx.fillStyle = "#0b0c0c";
  ctx.fillRect(0, H * 0.8, W, H * 0.2);
};

const water: Painter = (ctx, a) => {
  const horizon = H * 0.48;
  sky(ctx, a.pal, horizon);
  stars(ctx, a, 80, horizon * 0.8);
  moon(ctx, a, W * 0.5, H * 0.2, 100);
  hill(ctx, horizon - 30, 25, "#030405", a.seed);
  const wg = ctx.createLinearGradient(0, horizon, 0, H);
  wg.addColorStop(0, a.pal.skyBottom);
  wg.addColorStop(1, "#000");
  ctx.fillStyle = wg;
  ctx.fillRect(0, horizon, W, H - horizon);
  // moon reflection streaks
  for (let i = 0; i < 26; i++) {
    const y = horizon + 20 + i * 30;
    const w = 140 - i * 3 + noise1(a.t * 2 + i, a.seed) * 50;
    ctx.fillStyle = hexA(a.pal.glow, 0.35 - i * 0.012);
    ctx.fillRect(W / 2 - w / 2 + noise1(a.t + i * 0.3, 7) * 20, y, w, 5);
  }
  // ripples around something rising
  const rx = W * 0.5;
  const ry = H * 0.72;
  for (let k = 0; k < 4; k++) {
    const p = (a.t * 0.35 + k / 4) % 1;
    ctx.strokeStyle = `rgba(200,220,255,${0.25 * (1 - p)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(rx, ry, 40 + p * 360, (40 + p * 360) * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const rise = ease(clamp01(a.u * 1.3));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, ry);
  ctx.clip();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(rx, ry + 80 - rise * 170, 70, 90, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  eyePair(ctx, rx, ry + 60 - rise * 170, 9, blinkAt(a.t, 2), a.pal.accent, clamp01((rise - 0.6) * 3));
};

const room: Painter = (ctx, a) => {
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, "#1a1720");
  wall.addColorStop(1, "#0d0b10");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  // window with moonlight beam
  const wx = W * 0.58;
  const wy = H * 0.18;
  ctx.fillStyle = hexA(a.pal.glow, 0.5);
  ctx.fillRect(wx, wy, 300, 420);
  ctx.fillStyle = "#16131b";
  ctx.fillRect(wx + 142, wy, 16, 420);
  ctx.fillRect(wx, wy + 202, 300, 16);
  ctx.fillStyle = hexA(a.pal.glow, 0.14);
  ctx.beginPath();
  ctx.moveTo(wx, wy);
  ctx.lineTo(wx + 300, wy);
  ctx.lineTo(W * 0.6, H);
  ctx.lineTo(-200, H);
  ctx.fill();
  // floor
  ctx.fillStyle = "#060507";
  ctx.fillRect(0, H * 0.72, W, H * 0.28);
  // bed
  ctx.fillStyle = "#2b2733";
  ctx.fillRect(W * 0.05, H * 0.62, W * 0.62, H * 0.16);
  ctx.fillStyle = "#3a3544";
  ctx.fillRect(W * 0.05, H * 0.6, W * 0.2, 60);
  ctx.fillStyle = "#050405";
  ctx.fillRect(W * 0.03, H * 0.5, 40, H * 0.28);
  // closet ajar with eyes
  ctx.fillStyle = "#231f29";
  ctx.fillRect(W * 0.72, H * 0.38, W * 0.26, H * 0.4);
  ctx.fillStyle = "#000";
  const gap = 12 + ease(a.u) * 50;
  ctx.fillRect(W * 0.85 - gap / 2, H * 0.38, gap, H * 0.4);
  eyePair(ctx, W * 0.85, H * 0.5, 6, blinkAt(a.t, 0.7), a.pal.accent, clamp01(a.u * 3 - 1));
  // swinging bulb
  const ang = Math.sin(a.t * 1.6) * 0.25;
  const bx = W * 0.35 + Math.sin(ang) * 420;
  const by = Math.cos(ang) * 420;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(W * 0.35, 0);
  ctx.lineTo(bx, by);
  ctx.stroke();
  const on = noise1(a.t * 9, a.seed) > -0.4 ? 1 : 0.15;
  const lg = ctx.createRadialGradient(bx, by, 0, bx, by, 700);
  lg.addColorStop(0, `rgba(255,214,150,${0.55 * on})`);
  lg.addColorStop(1, "rgba(255,214,150,0)");
  ctx.fillStyle = lg;
  ctx.fillRect(bx - 700, by - 700, 1400, 1400);
  ctx.fillStyle = `rgba(255,236,200,${on})`;
  ctx.beginPath();
  ctx.arc(bx, by + 20, 22, 0, Math.PI * 2);
  ctx.fill();
};

const MESSAGES = [
  ["are you awake?", "i can see your light on", "don't turn around"],
  ["who is this?", "look outside", "no. the other window"],
  ["mom?", "you're home early", "i'm still at work, sweetie"],
  ["hey", "why did you leave the door open", "i'm in the hallway"],
];

const phone: Painter = (ctx, a) => {
  ctx.fillStyle = "#020203";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, 800);
  glow.addColorStop(0, "rgba(120,160,255,0.22)");
  glow.addColorStop(1, "rgba(120,160,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(W / 2 - 800, H * 0.5 - 800, 1600, 1600);
  const px = W * 0.2;
  const py = H * 0.2 + Math.sin(a.t * 1.3) * 8;
  const pw = W * 0.6;
  const ph = H * 0.58;
  roundRect(ctx, px, py, pw, ph, 60, "#0d0e12");
  roundRect(ctx, px + 20, py + 20, pw - 40, ph - 40, 44, "#14161d");
  ctx.fillStyle = "#e9ecf5";
  ctx.font = "600 34px 'Plus Jakarta Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Unknown", W / 2, py + 110);
  ctx.fillStyle = "rgba(233,236,245,0.45)";
  ctx.font = "26px 'Plus Jakarta Sans', sans-serif";
  ctx.fillText("03:13 AM", W / 2, py + 150);
  ctx.textAlign = "left";
  const msgs = MESSAGES[a.seed % MESSAGES.length];
  msgs.forEach((m, i) => {
    const appear = clamp01((a.u - i * 0.28) * 6);
    if (appear <= 0) return;
    ctx.globalAlpha = appear;
    ctx.font = "34px 'Plus Jakarta Sans', sans-serif";
    const tw = ctx.measureText(m).width + 56;
    const y = py + 220 + i * 120 + (1 - appear) * 20;
    roundRect(ctx, px + 50, y, tw, 84, 36, i === msgs.length - 1 ? "#7a1010" : "#2a2d38");
    ctx.fillStyle = "#fff";
    ctx.fillText(m, px + 78, y + 54);
    ctx.globalAlpha = 1;
  });
  // typing dots
  if (a.u < 0.95) {
    const y = py + 220 + Math.min(3, Math.floor(a.u / 0.28) + 1) * 120;
    if (y < py + ph - 120) {
      roundRect(ctx, px + 50, y, 130, 70, 34, "#2a2d38");
      for (let d = 0; d < 3; d++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + 0.7 * Math.max(0, Math.sin(a.t * 6 - d))})`;
        ctx.beginPath();
        ctx.arc(px + 85 + d * 30, y + 35, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
};

const voidScene: Painter = (ctx, a) => {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const pulse = 0.5 + 0.5 * Math.sin(a.t * 2.2);
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 900);
  g.addColorStop(0, hexA(a.pal.accent, 0.18 + 0.12 * pulse));
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // smoke tendrils
  const r = rng(a.seed);
  for (let i = 0; i < 9; i++) {
    const x0 = r() * W;
    ctx.strokeStyle = hexA(a.pal.accent, 0.08 + r() * 0.08);
    ctx.lineWidth = 20 + r() * 40;
    ctx.beginPath();
    for (let y = H + 50; y > -50; y -= 40) {
      const x = x0 + noise1(y / 300 + a.t * 0.3, i) * 220;
      if (y === H + 50) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export const PAINTERS: Record<Visual, Painter> = {
  moon: moonScene,
  forest,
  house,
  hallway,
  figure,
  eyes,
  graveyard,
  door,
  mirror,
  water,
  room,
  phone,
  void: voidScene,
};

/** Draw a user-supplied image with a slow Ken Burns pan and horror grade. */
export function paintImage(ctx: Ctx, img: { width: number; height: number }, a: PaintArgs) {
  const scale = Math.max(W / img.width, H / img.height) * lerp(1.08, 1.22, a.u);
  const w = img.width * scale;
  const h = img.height * scale;
  const dir = a.seed % 2 ? 1 : -1;
  const x = (W - w) / 2 + dir * lerp(-30, 30, a.u);
  const y = (H - h) / 2 + lerp(20, -20, a.u);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.filter = "saturate(0.75) contrast(1.1) brightness(0.85)";
  ctx.drawImage(img as CanvasImageSource, x, y, w, h);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = a.pal.skyBottom;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}
