// AI scene images via OpenAI's image API (OPENAI_API_KEY). Override the model with OPENAI_IMAGE_MODEL.

export function imagesAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY) && process.env.IMAGE_PROVIDER !== "none";
}

export function horrorPrompt(description: string, title: string): string {
  return [
    "Vertical 9:16 cinematic horror film still.",
    description.trim(),
    `From the short horror story "${title}".`,
    "Dark, atmospheric, low-key lighting, deep shadows, subtle film grain, desaturated cold colours,",
    "photorealistic, shot on 35mm, unsettling negative space. No text, no captions, no lettering, no watermark.",
  ].join(" ");
}

/** Returns PNG bytes for a portrait image. */
export async function generateImage(prompt: string): Promise<Buffer> {
  if (!imagesAvailable()) throw new Error("No image provider configured (set OPENAI_API_KEY).");
  const r = await fetch(`${openaiBase()}/images/generations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size: "1024x1536",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
      n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) throw new Error(`Image generation failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const data = (await r.json()) as { data: { b64_json?: string; url?: string }[] };
  const item = data.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return Buffer.from(await (await fetch(item.url)).arrayBuffer());
  throw new Error("Image API returned no image.");
}

function openaiBase() {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}
