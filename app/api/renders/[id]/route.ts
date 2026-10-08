import { HttpError, json, route } from "@/lib/server/http";
import { getRender } from "@/lib/server/projects";
import { requireUser } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const r = await getRender(user.id, (await params).id);
  if (!r) throw new HttpError(404, "Render not found");
  return json({ render: r });
});
