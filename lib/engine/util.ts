export const W = 1080;
export const H = 1920;

/** Deterministic PRNG so every frame of a scene is drawn from the same layout. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
export const ease = (t: number) => t * t * (3 - 2 * t);

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const r = (n: number) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  return lerp(r(i), r(i + 1), ease(f));
}

export type Ctx = CanvasRenderingContext2D;

/** Stable per-scene seed shared by the renderer and the sound engine. */
export function sceneSeed(id: string, visual: string, index: number): number {
  return (hash(id + visual) ^ index) >>> 0;
}

/** Times (seconds into the scene) when lightning strikes; thunder follows them. */
export function strikeTimes(dur: number, seed: number): number[] {
  return [dur * (0.2 + (seed % 7) / 30), dur * (0.65 + (seed % 5) / 40)];
}
