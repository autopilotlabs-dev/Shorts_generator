import { body, HttpError, json, route } from "@/lib/server/http";
import { generateImage, horrorPrompt, imagesAvailable } from "@/lib/server/images";
import { getProject, updateProject } from "@/lib/server/projects";
import { consume } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";
import { newFileId, projectPrefix, storage } from "@/lib/server/storage";

type Ctx = { params: Promise<{ id: string; sceneId: string }> };
export const maxDuration = 300;

const UPLOAD_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_UPLOAD = 8 * 1024 * 1024;

/** Check the real file signature, not just the client-declared MIME type. */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function setImage(userId: string, id: string, sceneId: string, imageKey: string | undefined, prompt?: string) {
  const latest = await getProject(userId, id);
  if (!latest?.plan?.scenes.some((s) => s.id === sceneId)) throw new HttpError(404, "Scene not found");
  const scenes = latest.plan.scenes.map((s) => {
    if (s.id !== sceneId) return s;
    const next = { ...s, imageKey };
    if (prompt !== undefined) next.imagePrompt = prompt;
    if (!imageKey) delete next.imageKey;
    return next;
  });
  return updateProject(userId, id, { plan: { ...latest.plan, scenes } });
}

/** Upload (multipart "file") or AI-generate (JSON { prompt? }) a background image for a scene. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, sceneId } = await params;
  const project = await getProject(user.id, id);
  const scene = project?.plan?.scenes.find((s) => s.id === sceneId);
  if (!project || !scene) throw new HttpError(404, "Scene not found");
  const prefix = projectPrefix(user.id, id);

  if ((req.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
    if (file.size > MAX_UPLOAD) throw new HttpError(400, "Image must be under 8 MB");
    const data = Buffer.from(await file.arrayBuffer());
    const type = sniff(data);
    if (!type) throw new HttpError(400, "Upload a PNG, JPEG or WebP image");
    const key = `${prefix}/img-${newFileId()}.${UPLOAD_TYPES[type]}`;
    await storage().put(key, data, type);
    return json({ project: await setImage(user.id, id, sceneId, key) });
  }

  if (!imagesAvailable()) throw new HttpError(400, "AI images aren't configured on this server.");
  await consume("image", user.id);
  const b = await body<{ prompt?: string }>(req);
  const description = (b.prompt ?? scene.imagePrompt ?? scene.text).trim().slice(0, 1000);
  if (!description) throw new HttpError(400, "Describe the image first.");
  const image = await generateImage(horrorPrompt(description, project.title));
  const key = `${prefix}/img-${newFileId()}.${image.ext}`;
  await storage().put(key, image.data, image.contentType);
  return json({ project: await setImage(user.id, id, sceneId, key, description) });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, sceneId } = await params;
  return json({ project: await setImage(user.id, id, sceneId, undefined) });
});
