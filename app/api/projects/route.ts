import { body, json, route } from "@/lib/server/http";
import { createProject, listProjects } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

export const GET = route(async () => {
  const user = await requireUser();
  const list = await listProjects(user.id);
  return json({ projects: list.map(({ plan, ...p }) => ({ ...p, scenes: plan?.scenes.length ?? 0 })) });
});

export const POST = route(async (req: Request) => {
  const user = await requireUser();
  const b = await body<{ title?: string; story?: string; duration?: number }>(req);
  return json({ project: await createProject(user.id, b) }, 201);
});
