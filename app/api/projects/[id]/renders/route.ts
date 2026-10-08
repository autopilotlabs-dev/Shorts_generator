import { HttpError, json, route } from "@/lib/server/http";
import { getProject, listRenders } from "@/lib/server/projects";
import { consume } from "@/lib/server/rate-limit";
import { enqueueRender } from "@/lib/server/render-queue";
import { requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  return json({ renders: await listRenders(user.id, (await params).id) });
});

export const POST = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const project = await getProject(user.id, (await params).id);
  if (!project) throw new HttpError(404, "Project not found");
  await consume("render", user.id);
  return json({ render: await enqueueRender(user.id, project) }, 202);
});
