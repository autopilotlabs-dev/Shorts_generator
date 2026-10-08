// Shared data model between the browser app and the API server.

export const VISUALS = [
  "forest",
  "house",
  "hallway",
  "figure",
  "eyes",
  "moon",
  "graveyard",
  "door",
  "mirror",
  "water",
  "room",
  "phone",
  "void",
] as const;
export type Visual = (typeof VISUALS)[number];

export const MOODS = ["dread", "tension", "terror", "eerie", "sad"] as const;
export type Mood = (typeof MOODS)[number];

export const SFX = [
  "heartbeat",
  "creak",
  "whisper",
  "stinger",
  "thunder",
  "rain",
  "footsteps",
  "knock",
  "musicbox",
  "scream",
  "glitch",
  "buzz",
  "drip",
  "bell",
] as const;
export type Sfx = (typeof SFX)[number];

export const EFFECTS = ["fog", "rain", "lightning", "shake", "glitch", "flicker", "dust", "zoom"] as const;
export type Effect = (typeof EFFECTS)[number];

export interface Scene {
  id: string;
  /** Caption text shown on screen for this scene. */
  text: string;
  visual: Visual;
  mood: Mood;
  /** Seconds. */
  duration: number;
  effects: Effect[];
  sfx: Sfx[];
  /** Optional user-provided background image (object URL / data URL). Browser only. */
  image?: string;
}

export interface StoryPlan {
  title: string;
  scenes: Scene[];
}

export const MIN_DURATION = 10;
export const MAX_DURATION = 60;
export const MIN_SCENE = 1.5;

export function clampDuration(sec: number): number {
  return Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(sec)));
}

export function totalDuration(plan: StoryPlan): number {
  return plan.scenes.reduce((sum, s) => sum + s.duration, 0);
}

/** Rescale scene durations so they add up to `target` seconds, keeping relative weights. */
export function fitDurations(scenes: Scene[], target: number): Scene[] {
  if (scenes.length === 0) return scenes;
  const weights = scenes.map((s) => Math.max(0.1, s.duration));
  const sum = weights.reduce((a, b) => a + b, 0);
  const minTotal = MIN_SCENE * scenes.length;
  const usable = Math.max(0, target - minTotal);
  const out = scenes.map((s, i) => ({
    ...s,
    duration: Math.round((MIN_SCENE + (usable * weights[i]) / sum) * 10) / 10,
  }));
  // Absorb rounding error in the last scene.
  const drift = target - out.reduce((a, s) => a + s.duration, 0);
  out[out.length - 1].duration = Math.round((out[out.length - 1].duration + drift) * 10) / 10;
  return out;
}
