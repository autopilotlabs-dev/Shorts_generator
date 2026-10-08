import { currentUser } from "@/lib/server/session";
import { isSafeKey, storage, verifySignature } from "@/lib/server/storage";

type Ctx = { params: Promise<{ path: string[] }> };

/**
 * Serves stored media. Access is allowed for the owning user's session, or with a
 * short-lived signed URL (used by the render worker's headless browser).
 */
export async function GET(req: Request, { params }: Ctx) {
  const key = (await params).path.join("/");
  if (!isSafeKey(key)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const signed = verifySignature(key, url.searchParams.get("exp"), url.searchParams.get("sig"));
  if (!signed) {
    const user = await currentUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    if (!key.startsWith(`${user.id}/`)) return new Response("Not found", { status: 404 });
  }

  const obj = await storage().open(key, req.headers.get("range"));
  if (!obj) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": obj.contentType,
    "Content-Length": String(obj.size),
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=31536000, immutable",
    // The render worker's browser loads signed media cross-origin.
    ...(signed && { "Access-Control-Allow-Origin": "*" }),
  };
  if (obj.range) headers["Content-Range"] = obj.range;
  const name = url.searchParams.get("download");
  if (name) headers["Content-Disposition"] = `attachment; filename="${name.replace(/[^\w.-]+/g, "-")}"`;
  return new Response(obj.body, { status: obj.status, headers });
}
