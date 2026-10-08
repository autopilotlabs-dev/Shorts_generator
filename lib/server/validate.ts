// Sanitises a client-supplied plan before it is stored or rendered.
import { EFFECTS, MOODS, SFX, VISUALS, type Scene, type StoryPlan } from "../engine/types";
import { HttpError } from "./http";

const MAX_SCENES = 30;

function pick<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function validatePlan(raw: unknown, userId: string): StoryPlan {
  const p = raw as Partial<StoryPlan> | null;
  if (!p || !Array.isArray(p.scenes)) throw new HttpError(400, "Invalid plan");
  if (p.scenes.length > MAX_SCENES) throw new HttpError(400, `At most ${MAX_SCENES} scenes`);
  const ownMedia = (u: unknown) => typeof u === "string" && u.startsWith(`/api/media/${userId}/`) && !u.includes("..");
  const scenes: Scene[] = p.scenes.map((s, i) => {
    const scene: Scene = {
      id: typeof s?.id === "string" && s.id ? s.id.slice(0, 40) : `s${i + 1}`,
      text: String(s?.text ?? "").slice(0, 400),
      visual: pick(s?.visual, VISUALS, "void"),
      mood: pick(s?.mood, MOODS, "dread"),
      duration: Math.min(20, Math.max(1, Number(s?.duration) || 3)),
      effects: [...new Set((Array.isArray(s?.effects) ? s.effects : []).filter((e) => EFFECTS.includes(e)))],
      sfx: [...new Set((Array.isArray(s?.sfx) ? s.sfx : []).filter((e) => SFX.includes(e)))],
    };
    if (typeof s?.imagePrompt === "string") scene.imagePrompt = s.imagePrompt.slice(0, 1000);
    if (ownMedia(s?.image)) scene.image = s.image;
    const n = s?.narration;
    if (n && ownMedia(n.url) && Number.isFinite(n.duration)) {
      scene.narration = { url: n.url, duration: Number(n.duration), voice: String(n.voice ?? ""), text: String(n.text ?? "") };
    }
    return scene;
  });
  return { title: String(p.title ?? "").slice(0, 80), scenes };
}
