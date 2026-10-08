// Text-to-speech narration. Providers are picked from env keys:
//   ELEVENLABS_API_KEY -> ElevenLabs (best horror voices)
//   OPENAI_API_KEY     -> OpenAI gpt-4o-mini-tts (steerable delivery)
// Override with TTS_PROVIDER=elevenlabs|openai|none.

export interface Voice {
  id: string;
  label: string;
  description: string;
}

export type TtsProvider = "elevenlabs" | "openai";

const NARRATOR_STYLE =
  "You are narrating a short horror story. Speak slowly and deliberately in a low, hushed, unsettling tone, " +
  "like someone telling a scary story by a campfire. Leave small dramatic pauses at commas and full stops. " +
  "Build tension; drop almost to a whisper on the most frightening lines.";

const OPENAI_VOICES: Voice[] = [
  { id: "onyx", label: "Onyx", description: "Deep, resonant male" },
  { id: "ash", label: "Ash", description: "Gravelly, hushed male" },
  { id: "ballad", label: "Ballad", description: "Soft, eerie storyteller" },
  { id: "sage", label: "Sage", description: "Calm, cold female" },
  { id: "shimmer", label: "Shimmer", description: "Breathy female" },
  { id: "fable", label: "Fable", description: "British storyteller" },
];

const ELEVEN_DEFAULT: Voice[] = [
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam", description: "Deep male narrator" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel", description: "Calm female narrator" },
];

export function ttsProvider(): TtsProvider | null {
  const forced = process.env.TTS_PROVIDER?.toLowerCase();
  if (forced === "none") return null;
  if (forced === "elevenlabs" && process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (forced === "openai" && process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

let elevenCache: { at: number; voices: Voice[] } | null = null;

export async function listVoices(): Promise<Voice[]> {
  const p = ttsProvider();
  if (p === "openai") return OPENAI_VOICES;
  if (p !== "elevenlabs") return [];
  if (elevenCache && Date.now() - elevenCache.at < 10 * 60_000) return elevenCache.voices;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = (await r.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
    const voices = data.voices.slice(0, 40).map((v) => ({
      id: v.voice_id,
      label: v.name,
      description: [v.labels?.gender, v.labels?.accent, v.labels?.description].filter(Boolean).join(", "),
    }));
    elevenCache = { at: Date.now(), voices: voices.length ? voices : ELEVEN_DEFAULT };
  } catch (err) {
    console.warn("Could not list ElevenLabs voices:", err);
    elevenCache = { at: Date.now(), voices: ELEVEN_DEFAULT };
  }
  return elevenCache.voices;
}

export async function defaultVoice(): Promise<string> {
  return (await listVoices())[0]?.id ?? "";
}

/** Returns MP3 bytes for `text` read by `voiceId`. */
export async function synthesize(text: string, voiceId: string): Promise<Buffer> {
  const p = ttsProvider();
  if (!p) throw new Error("No text-to-speech provider configured.");
  const voice = voiceId || (await defaultVoice());

  if (p === "openai") {
    const r = await fetch(`${openaiBase()}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
        voice,
        input: text,
        instructions: NARRATOR_STYLE,
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`OpenAI TTS failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
    return Buffer.from(await r.arrayBuffer());
  }

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || "eleven_multilingual_v2",
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`ElevenLabs TTS failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  return Buffer.from(await r.arrayBuffer());
}

function openaiBase() {
  return (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}
