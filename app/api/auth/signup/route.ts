import { createUser, startSession, validateCredentials } from "@/lib/server/auth";
import { body, json, route } from "@/lib/server/http";

export const POST = route(async (req: Request) => {
  const b = await body<{ email?: string; password?: string; name?: string }>(req);
  const { email, password, name } = validateCredentials(b.email, b.password, b.name ?? "");
  const user = await createUser(email, password, name);
  await startSession(user.id);
  return json({ user }, 201);
});
