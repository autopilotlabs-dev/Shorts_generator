import { aiAvailable } from "./ai-planner";
import { imagesAvailable } from "./images";
import { ttsAvailable, VOICES, type Voice } from "./tts";

export interface Capabilities {
  ai: boolean;
  tts: boolean;
  voices: Voice[];
  images: boolean;
}

export function capabilities(): Capabilities {
  return { ai: aiAvailable(), tts: ttsAvailable(), voices: VOICES, images: imagesAvailable() };
}
