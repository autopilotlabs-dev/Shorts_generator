import { spawnSync } from "node:child_process";
import { aiAvailable } from "./ai-planner";
import { imagesAvailable } from "./images";
import { listVoices, ttsProvider, type Voice } from "./tts";

export interface Capabilities {
  ai: boolean;
  tts: { provider: string | null; voices: Voice[] };
  images: boolean;
  ffmpeg: boolean;
}

let ffmpeg: boolean | undefined;
export function ffmpegAvailable(): boolean {
  ffmpeg ??= spawnSync(/*turbopackIgnore: true*/ process.env.FFMPEG_PATH || "ffmpeg", ["-version"]).status === 0;
  return ffmpeg;
}

export async function capabilities(): Promise<Capabilities> {
  return {
    ai: aiAvailable(),
    tts: { provider: ttsProvider(), voices: await listVoices() },
    images: imagesAvailable(),
    ffmpeg: ffmpegAvailable(),
  };
}
