// AI scene images with OpenAI gpt-image-1-mini (portrait 1024x1536: $0.006 low / $0.015 medium per image).
import { openai, openaiConfigured } from "./openai";

export const imagesAvailable = () => openaiConfigured() && process.env.IMAGE_PROVIDER !== "none";

export function horrorPrompt(description: string, title: string): string {
  return [
    "Vertical 9:16 cinematic horror film still.",
    description.trim(),
    `From the short horror story "${title}".`,
    "Dark, atmospheric, low-key lighting, deep shadows, subtle film grain, desaturated cold colours,",
    "photorealistic, shot on 35mm, unsettling negative space. No text, no captions, no lettering, no watermark.",
  ].join(" ");
}

export async function generateImage(prompt: string): Promise<{ data: Buffer; ext: "jpg"; contentType: "image/jpeg" }> {
  const res = await openai().images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini",
    prompt,
    size: "1024x1536",
    quality: (process.env.OPENAI_IMAGE_QUALITY as "low" | "medium" | "high") || "medium",
    output_format: "jpeg",
    output_compression: 85,
    n: 1,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("The image API returned no image.");
  return { data: Buffer.from(b64, "base64"), ext: "jpg", contentType: "image/jpeg" };
}
