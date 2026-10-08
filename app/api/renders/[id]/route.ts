import { requireUser } from "@/lib/server/auth";
import { HttpError, json, route } from "@/lib/server/http";
import { getRender } from "@/lib/server/projects";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const r = getRender(user.id, (await params).id);
  if (!r) throw new HttpError(404, "Render not found");
  return json({ render: r });
});
