// The scene spec Claude writes for a 3D cartoon horror short (shorts/<name>/short.json).
// Everything is validated here so mistakes surface as clear errors Claude can fix.
import { z } from "zod";
import { EFFECTS, MOODS, SFX } from "../engine/types";

export const SETS = ["bedroom", "hallway", "house_exterior", "forest", "graveyard", "lake", "basement", "void"] as const;
export const CHARACTERS = ["kid", "adult", "ghost", "monster", "shadow_figure", "doll", "cat"] as const;
export const ACTIONS = [
  "idle", // breathing in place
  "walk_in", // walks toward camera from behind
  "walk_away", // walks away into the scene
  "walk_left",
  "walk_right",
  "look_around", // head turns side to side
  "scared", // trembles, leans back
  "run", // fast run toward camera
  "peek", // leans out from the side
  "float", // hovers (ghost)
  "creep_closer", // slowly approaches the camera
  "reveal", // fades/rises into view
  "sleep", // lies still (put on a bed)
  "turn_around", // turns from facing away to facing camera
] as const;
export const EXPRESSIONS = ["neutral", "scared", "surprised", "smile", "creepy_smile", "angry", "closed"] as const;
export const FACING = ["camera", "left", "right", "away"] as const;
export const PROPS = [
  "bed", "lamp", "door", "window", "mirror", "closet", "chair", "table", "tv", "phone", "teddy", "candle",
  "tree", "dead_tree", "grave", "fence", "pumpkin", "lantern", "stairs", "box", "rocking_chair", "music_box",
] as const;
export const SHOTS = ["extreme_wide", "wide", "medium", "closeup", "extreme_closeup", "low_angle", "high_angle", "over_shoulder", "pov"] as const;
export const MOVES = ["static", "dolly_in", "dolly_out", "pan_left", "pan_right", "orbit_left", "orbit_right", "tilt_up", "crane_down", "handheld", "shake", "push_in_fast"] as const;
export const KEY_LIGHTS = ["moon", "lamp", "flashlight", "candle", "tv", "lightning", "red_emergency", "none"] as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "use a #rrggbb colour");

export const ActorSchema = z.object({
  id: z.string().min(1).max(30),
  character: z.enum(CHARACTERS),
  /** Horizontal position: -2 (left) .. 2 (right). 0 is centre. */
  x: z.number().min(-4).max(4).default(0),
  /** Depth: 0 is the subject mark; negative is further away, positive is closer to camera. */
  z: z.number().min(-12).max(3).default(0),
  facing: z.enum(FACING).default("camera"),
  action: z.enum(ACTIONS).default("idle"),
  expression: z.enum(EXPRESSIONS).default("neutral"),
  /** Seconds into the scene when the actor appears / starts its action. */
  start: z.number().min(0).default(0),
  scale: z.number().min(0.3).max(3).default(1),
  outfit: hex.optional(),
  hair: hex.optional(),
  skin: hex.optional(),
  /** Glowing eyes (monsters, possessed dolls…). */
  glowingEyes: z.boolean().default(false),
});

export const PropSchema = z.object({
  type: z.enum(PROPS),
  x: z.number().min(-8).max(8).default(0),
  z: z.number().min(-15).max(3).default(-1),
  rotation: z.number().min(-360).max(360).default(0),
  scale: z.number().min(0.2).max(4).default(1),
  color: hex.optional(),
  /** Props that can animate: door/closet open, lamp/tv/candle on, music_box playing, rocking_chair rocking. */
  active: z.boolean().default(false),
  /** Seconds into the scene when an active prop starts animating. */
  start: z.number().min(0).default(0),
});

export const CameraSchema = z.object({
  shot: z.enum(SHOTS).default("medium"),
  move: z.enum(MOVES).default("dolly_in"),
  /** Actor id the camera frames; defaults to the first actor (or the set centre). */
  target: z.string().optional(),
  /** Move intensity 0..2 (1 = normal). */
  intensity: z.number().min(0).max(2).default(1),
});

export const SceneSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,30}$/, "lowercase id like s1"),
  /** Read aloud by the narrator and shown as captions. Keep each scene to one or two sentences. */
  narration: z.string().max(300).default(""),
  /** Seconds. Omit to fit the narration automatically. */
  duration: z.number().min(1.5).max(15).optional(),
  set: z.enum(SETS),
  mood: z.enum(MOODS).default("dread"),
  keyLight: z.enum(KEY_LIGHTS).default("moon"),
  flicker: z.boolean().default(false),
  /** Fog density 0 (clear) .. 1 (thick). */
  fog: z.number().min(0).max(1).default(0.4),
  weather: z.enum(["none", "rain", "snow", "fireflies", "dust"]).default("none"),
  camera: CameraSchema.default({ shot: "medium", move: "dolly_in", intensity: 1 }),
  actors: z.array(ActorSchema).max(5).default([]),
  props: z.array(PropSchema).max(15).default([]),
  sfx: z.array(z.enum(SFX)).max(4).default([]),
  /** 2D post effects layered on top of the 3D render. */
  effects: z.array(z.enum(EFFECTS)).max(4).default([]),
  /** Optional hand-written scene: path (relative to the short folder) of a .tsx file exporting a default React Three Fiber component. */
  custom: z.string().regex(/^scenes\/[A-Za-z0-9_-]+\.tsx$/).optional(),
});

export const ShortSchema = z
  .object({
    title: z.string().min(1).max(60),
    /** Kokoro voice id, e.g. am_onyx, am_michael, af_heart, bm_george. */
    voice: z.string().default("am_onyx"),
    /** Narration speed (Kokoro), 0.7..1.2. Horror reads best a little slow. */
    speed: z.number().min(0.7).max(1.2).default(0.92),
    captionStyle: z.enum(["bold", "typewriter", "creepy"]).default("bold"),
    showTitle: z.boolean().default(true),
    quality: z.union([z.literal(720), z.literal(1080)]).default(720),
    music: z.number().min(0).max(1.5).default(1),
    sfxVolume: z.number().min(0).max(1.5).default(1),
    voiceVolume: z.number().min(0).max(1.5).default(1),
    scenes: z.array(SceneSchema).min(1).max(20),
  })
  .superRefine((s, ctx) => {
    const ids = new Set<string>();
    s.scenes.forEach((sc, i) => {
      if (ids.has(sc.id)) ctx.addIssue({ code: "custom", path: ["scenes", i, "id"], message: `duplicate scene id "${sc.id}"` });
      ids.add(sc.id);
      const actorIds = new Set(sc.actors.map((a) => a.id));
      if (sc.camera.target && !actorIds.has(sc.camera.target)) {
        ctx.addIssue({ code: "custom", path: ["scenes", i, "camera", "target"], message: `no actor with id "${sc.camera.target}" in this scene` });
      }
      if (!sc.narration && !sc.duration) {
        ctx.addIssue({ code: "custom", path: ["scenes", i, "duration"], message: "scenes without narration need an explicit duration" });
      }
    });
  });

export type ShortSpec = z.infer<typeof ShortSchema>;
export type Scene3D = z.infer<typeof SceneSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type Prop = z.infer<typeof PropSchema>;

/** A spec with timings resolved (what the composition receives). */
export interface ResolvedShort extends ShortSpec {
  scenes: (Scene3D & { duration: number; start: number; narrationFile?: string; narrationDuration?: number })[];
  soundtrack: string | null;
}

export function formatIssues(err: z.ZodError): string {
  return err.issues.map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
}
