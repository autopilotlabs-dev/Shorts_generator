import { requireUser } from "@/lib/server/auth";
import { HttpError, json, route } from "@/lib/server/http";
import { getProject, listRenders } from "@/lib/server/projects";
import { enqueueRender, ensureWorkers } from "@/lib/server/render-queue";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  ensureWorkers();
  return json({ renders: listRenders(user.id, (await params).id) });
});

export const POST = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = getProject(user.id, (await params).id);
  if (!project) throw new HttpError(404, "Project not found");
  return json({ render: enqueueRender(user.id, project) }, 202);
});
