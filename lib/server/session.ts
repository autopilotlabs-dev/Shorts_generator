import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { HttpError } from "./http";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** The signed-in user for this request, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}
