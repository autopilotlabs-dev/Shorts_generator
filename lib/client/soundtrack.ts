// Mixes the preview soundtrack in the browser (native OfflineAudioContext) so the
// Remotion <Player> plays exactly the audio the server render will contain.
import type { Mix, VoiceBank } from "@/lib/engine/audio";
import { encodeWav, mixSoundtrack } from "@/lib/engine/soundtrack";
import type { StoryPlan } from "@/lib/engine/types";
import { mediaSrc } from "./platform";

const decoded: VoiceBank = new Map();

async function loadVoices(plan: StoryPlan): Promise<VoiceBank> {
  const ctx = new OfflineAudioContext(2, 1, 48000);
  await Promise.all(
    plan.scenes.map(async (s) => {
      const key = s.narration?.key;
      if (!key || decoded.has(key)) return;
      const buf = await (await fetch(mediaSrc(key))).arrayBuffer();
      decoded.set(key, await ctx.decodeAudioData(buf));
    }),
  );
  return decoded;
}

/** Returns an object URL for a WAV of the full soundtrack. Caller revokes it. */
export async function previewSoundtrack(plan: StoryPlan, mix: Mix): Promise<string> {
  const voices = await loadVoices(plan);
  const buffer = await mixSoundtrack((c, len, sr) => new OfflineAudioContext(c, len, sr), plan, mix, voices);
  return URL.createObjectURL(new Blob([encodeWav(buffer) as BlobPart], { type: "audio/wav" }));
}
