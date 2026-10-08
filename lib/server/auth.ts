// Email + password accounts with opaque, hashed session tokens in an httpOnly cookie.
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db, newId, now } from "./db";

export const SESSION_COOKIE = "ns_session";
const SESSION_DAYS = 30;

export interface User {
  id: string;
  email: string;
  name: string;
}

let dummyHash: string | undefined;

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export function validateCredentials(email: unknown, password: unknown, name?: unknown) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new AuthError("Enter a valid email address.");
  if (typeof password !== "string" || password.length < 8) throw new AuthError("Password must be at least 8 characters.");
  if (password.length > 200) throw new AuthError("Password is too long.");
  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 60)) throw new AuthError("Enter your name.");
  return { email: email.trim().toLowerCase(), password, name: typeof name === "string" ? name.trim() : "" };
}

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const exists = db().prepare("SELECT 1 FROM users WHERE email = ?").get(email);
  if (exists) throw new AuthError("An account with this email already exists.", 409);
  const user = { id: newId("u_"), email, name };
  const hash = await bcrypt.hash(password, 11);
  db().prepare("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(user.id, email, name, hash, now());
  return user;
}

export async function verifyUser(email: string, password: string): Promise<User> {
  const row = db().prepare("SELECT id, email, name, password_hash FROM users WHERE email = ?").get(email) as
    | (User & { password_hash: string })
    | undefined;
  // Compare against a dummy hash when the user doesn't exist to keep timing similar.
  dummyHash ??= bcrypt.hashSync("nightshade-dummy", 11);
  const ok = await bcrypt.compare(password, row?.password_hash ?? dummyHash);
  if (!row || !ok) throw new AuthError("Incorrect email or password.", 401);
  return { id: row.id, email: row.email, name: row.name };
}

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = now() + SESSION_DAYS * 864e5;
  db().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(hashToken(token), userId, expires);
  db().prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires: new Date(expires),
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) db().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/** The signed-in user for this request, or null. */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?",
    )
    .get(hashToken(token), now()) as User | undefined;
  return row ? { id: row.id, email: row.email, name: row.name } : null;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) throw new AuthError("Please sign in.", 401);
  return u;
}
