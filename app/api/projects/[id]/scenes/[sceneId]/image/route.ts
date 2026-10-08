import { requireUser } from "@/lib/server/auth";
import { body, HttpError, json, rateLimit, route } from "@/lib/server/http";
import { generateImage, horrorPrompt, imagesAvailable } from "@/lib/server/images";
import { fileId, getProject, saveMedia, updateProject } from "@/lib/server/projects";

type Ctx = { params: Promise<{ id: string; sceneId: string }> };
export const maxDuration = 300;

const UPLOAD_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MAX_UPLOAD = 8 * 1024 * 1024;

function setImage(userId: string, id: string, sceneId: string, image: string | undefined, prompt?: string) {
  const latest = getProject(userId, id);
  if (!latest?.plan) throw new HttpError(404, "Project not found");
  if (!latest.plan.scenes.some((s) => s.id === sceneId)) throw new HttpError(404, "Scene not found");
  const scenes = latest.plan.scenes.map((s) => {
    if (s.id !== sceneId) return s;
    const next = { ...s, image };
    if (prompt !== undefined) next.imagePrompt = prompt;
    if (!image) delete next.image;
    return next;
  });
  return updateProject(userId, id, { plan: { ...latest.plan, scenes } });
}

/** Upload (multipart "file") or AI-generate (JSON { prompt? }) a background image for a scene. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, sceneId } = await params;
  const project = getProject(user.id, id);
  const scene = project?.plan?.scenes.find((s) => s.id === sceneId);
  if (!project || !scene) throw new HttpError(404, "Scene not found");

  if ((req.headers.get("content-type") || "").startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
    const ext = UPLOAD_TYPES[file.type];
    if (!ext) throw new HttpError(400, "Upload a PNG, JPEG or WebP image");
    if (file.size > MAX_UPLOAD) throw new HttpError(400, "Image must be under 8 MB");
    const url = await saveMedia(user.id, id, `img-${fileId()}.${ext}`, Buffer.from(await file.arrayBuffer()));
    return json({ project: setImage(user.id, id, sceneId, url) });
  }

  if (!imagesAvailable()) throw new HttpError(400, "AI images aren't configured on this server.");
  rateLimit(`img:${user.id}`, 100);
  const b = await body<{ prompt?: string }>(req);
  const description = (b.prompt ?? scene.imagePrompt ?? scene.text).trim().slice(0, 1000);
  if (!description) throw new HttpError(400, "Describe the image first.");
  const png = await generateImage(horrorPrompt(description, project.title));
  const url = await saveMedia(user.id, id, `img-${fileId()}.png`, png);
  return json({ project: setImage(user.id, id, sceneId, url, description) });
});

export const DELETE = route(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, sceneId } = await params;
  return json({ project: setImage(user.id, id, sceneId, undefined) });
});
