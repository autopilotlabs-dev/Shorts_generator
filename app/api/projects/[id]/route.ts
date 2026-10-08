import { body, HttpError, json, route } from "@/lib/server/http";
import { deleteProject, getProject, updateProject, type ProjectPatch } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";
import { validatePlan } from "@/lib/server/validate";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const p = await getProject(user.id, (await params).id);
  if (!p) throw new HttpError(404, "Project not found");
  return json({ project: p });
});

export const PATCH = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const id = (await params).id;
  const b = await body<ProjectPatch>(req);
  if (b.plan) b.plan = validatePlan(b.plan, user.id, id);
  const p = await updateProject(user.id, id, b);
  if (!p) throw new HttpError(404, "Project not found");
  return json({ project: p });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  if (!(await deleteProject(user.id, (await params).id))) throw new HttpError(404, "Project not found");
  return json({ ok: true });
});
