import { fitToNarration, type Scene } from "@/lib/engine/types";
import { audioDuration } from "@/lib/server/audio-decode";
import { requireUser } from "@/lib/server/auth";
import { body, HttpError, json, rateLimit, route } from "@/lib/server/http";
import { fileId, getProject, saveMedia, updateProject } from "@/lib/server/projects";
import { defaultVoice, synthesize, ttsProvider } from "@/lib/server/tts";

type Ctx = { params: Promise<{ id: string }> };
export const maxDuration = 300;

/** Generate narration for every scene whose clip is missing or out of date, then fit scene timing to the voice. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = (await params).id;
  if (!ttsProvider()) throw new HttpError(400, "Voice narration isn't configured on this server.");
  const project = getProject(user.id, id);
  if (!project?.plan) throw new HttpError(404, "Generate scenes first.");
  const b = await body<{ voice?: string; force?: boolean }>(req);
  const voice = b.voice || project.settings.voiceId || (await defaultVoice());

  const stale = (s: Scene) => b.force || !s.narration || s.narration.voice !== voice || s.narration.text !== s.text.trim();
  const todo = project.plan.scenes.filter((s) => s.text.trim() && stale(s));
  rateLimit(`tts:${user.id}`, 300, undefined, Math.max(1, todo.length));

  const made = new Map<string, NonNullable<Scene["narration"]>>();
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const text = s.text.trim();
        const mp3 = await synthesize(text, voice);
        const duration = await audioDuration(mp3);
        const url = await saveMedia(user.id, id, `voice-${fileId()}.mp3`, mp3);
        made.set(s.id, { url, duration, voice, text });
      }
    }),
  );

  // Merge into the latest saved plan (the user may have edited other fields meanwhile).
  const latest = getProject(user.id, id)!;
  const scenes = (latest.plan ?? project.plan).scenes.map((s) => {
    const n = made.get(s.id);
    return n && n.text === s.text.trim() ? { ...s, narration: n } : s;
  });
  const saved = updateProject(user.id, id, {
    plan: { ...(latest.plan ?? project.plan), scenes: fitToNarration(scenes) },
    settings: { voiceId: voice },
  });
  return json({ project: saved, generated: made.size });
});

/** Remove narration from all scenes. */
export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = (await params).id;
  const project = getProject(user.id, id);
  if (!project?.plan) throw new HttpError(404, "Project not found");
  const scenes = project.plan.scenes.map(({ narration: _n, ...s }) => s);
  return json({ project: updateProject(user.id, id, { plan: { ...project.plan, scenes } }) });
});
