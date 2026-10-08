import { requireUser } from "@/lib/server/auth";
import { capabilities } from "@/lib/server/capabilities";
import { json, route } from "@/lib/server/http";

export const GET = route(async () => {
  await requireUser();
  return json(await capabilities());
});
