import { planLocally } from "@/lib/engine/planner";
import { aiAvailable, planWithClaude } from "@/lib/server/ai-planner";
import { body, HttpError, json, route } from "@/lib/server/http";
import { getProject, updateProject } from "@/lib/server/projects";
import { consume } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = (await params).id;
  const project = await getProject(user.id, id);
  if (!project) throw new HttpError(404, "Project not found");
  const b = await body<{ story?: string; duration?: number; title?: string; useAi?: boolean }>(req);
  const story = String(b.story ?? project.story).trim();
  if (story.split(/\s+/).filter(Boolean).length < 5) throw new HttpError(400, "Write at least a sentence or two first.");
  if (story.length > 6000) throw new HttpError(400, "Story must be under 6000 characters.");
  const duration = Number(b.duration) || project.duration;
  const title = (b.title ?? project.title) === "Untitled story" ? "" : (b.title ?? project.title);

  let source: "ai" | "local" = "local";
  let plan;
  if (b.useAi !== false && aiAvailable()) {
    await consume("plan", user.id);
    try {
      plan = await planWithClaude(story, duration, title);
      source = "ai";
    } catch (err) {
      console.error("AI planning failed, falling back to local planner:", err);
    }
  }
  plan ??= planLocally(story, duration, title);
  const saved = await updateProject(user.id, id, { story, duration, plan, title: title || plan.title });
  return json({ project: saved, source });
});
