import { capabilities } from "@/lib/server/capabilities";
import { json, route } from "@/lib/server/http";
import { requireUser } from "@/lib/server/session";

export const GET = route(async () => {
  await requireUser();
  return json(capabilities());
});
