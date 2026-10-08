// Narration with OpenAI text-to-speech (gpt-4o-mini-tts: ~$0.015 per audio minute, steerable delivery).
import { openai, openaiConfigured } from "./openai";

export interface Voice {
  id: string;
  label: string;
  description: string;
}

const MODEL = () => process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";

const NARRATOR_STYLE =
  "You are narrating a short horror story. Speak slowly and deliberately in a low, hushed, unsettling tone, " +
  "like someone telling a scary story by a campfire. Leave small dramatic pauses at commas and full stops. " +
  "Build tension; drop almost to a whisper on the most frightening lines.";

export const VOICES: Voice[] = [
  { id: "onyx", label: "Onyx", description: "Deep, resonant male" },
  { id: "ash", label: "Ash", description: "Gravelly, hushed male" },
  { id: "ballad", label: "Ballad", description: "Soft, eerie storyteller" },
  { id: "sage", label: "Sage", description: "Calm, cold female" },
  { id: "shimmer", label: "Shimmer", description: "Breathy female" },
  { id: "fable", label: "Fable", description: "British storyteller" },
];

export const ttsAvailable = openaiConfigured;
export const defaultVoice = () => VOICES[0].id;

/** MP3 bytes for `text` read by `voice`. */
export async function synthesize(text: string, voice: string): Promise<Buffer> {
  const res = await openai().audio.speech.create({
    model: MODEL(),
    voice: VOICES.some((v) => v.id === voice) ? voice : defaultVoice(),
    input: text,
    instructions: NARRATOR_STYLE,
    response_format: "mp3",
  });
  return Buffer.from(await res.arrayBuffer());
}
