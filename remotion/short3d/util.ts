// Small deterministic helpers for frame-based animation (no Math.random: every frame must be reproducible).
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const easeIn = (t: number) => clamp01(t) ** 2;

/** Seeded PRNG (mulberry32). */
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

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Smooth value noise in [-1, 1]. */
export function noise(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const r = (n: number) => {
    const s = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  return lerp(r(i), r(i + 1), f * f * (3 - 2 * f));
}

/** 0..1 flicker signal for unstable lights. */
export const flickerAt = (t: number, seed = 1) => {
  const n = noise(t * 11, seed) * 0.5 + noise(t * 37, seed + 3) * 0.25;
  return n < -0.35 ? 0.12 : 0.75 + n * 0.3;
};
