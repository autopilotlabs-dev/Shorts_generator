import { startSession, validateCredentials, verifyUser } from "@/lib/server/auth";
import { body, json, rateLimit, route } from "@/lib/server/http";

export const POST = route(async (req: Request) => {
  const b = await body<{ email?: string; password?: string }>(req);
  const { email, password } = validateCredentials(b.email, b.password);
  rateLimit(`login:${email}`, 20, 15 * 60_000);
  const user = await verifyUser(email, password);
  await startSession(user.id);
  return json({ user });
});
