import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { requireUser } from "@/lib/server/auth";
import { HttpError, route } from "@/lib/server/http";
import { mediaPath } from "@/lib/server/projects";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
};

type Ctx = { params: Promise<{ path: string[] }> };

/** Serves a user's own media with HTTP Range support (needed for video seeking). */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const parts = (await params).path;
  const file = mediaPath(user.id, `/api/media/${parts.map(encodeURIComponent).join("/")}`);
  if (!file) throw new HttpError(404, "Not found");
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new HttpError(404, "Not found");

  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, max-age=31536000, immutable",
  };
  const url = new URL(req.url);
  if (url.searchParams.has("download")) {
    const name = (url.searchParams.get("download") || path.basename(file)).replace(/[^\w.-]+/g, "-");
    headers["Content-Disposition"] = `attachment; filename="${name}"`;
  }

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : info.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : info.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, info.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${info.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(info.size) } });
});
