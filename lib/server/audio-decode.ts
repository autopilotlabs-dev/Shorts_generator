// Server-side audio: decode narration MP3s and mix the soundtrack with node-web-audio-api.
import { OfflineAudioContext } from "node-web-audio-api";
import type { VoiceBank } from "../engine/audio";
import { encodeWav, mixSoundtrack, SAMPLE_RATE } from "../engine/soundtrack";
import type { ProjectSettings, StoryPlan } from "../engine/types";

const ctxFactory = (channels: number, length: number, sampleRate: number) =>
  new OfflineAudioContext({ numberOfChannels: channels, length, sampleRate }) as unknown as globalThis.OfflineAudioContext;

export async function decodeAudio(data: Buffer | Uint8Array): Promise<AudioBuffer> {
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return ctxFactory(2, 1, SAMPLE_RATE).decodeAudioData(ab);
}

export async function audioDuration(data: Buffer | Uint8Array): Promise<number> {
  return (await decodeAudio(data)).duration;
}

/** Full soundtrack (score + SFX + narration) as WAV bytes. */
export async function buildSoundtrack(plan: StoryPlan, settings: ProjectSettings, read: (key: string) => Promise<Buffer>): Promise<Uint8Array> {
  const voices: VoiceBank = new Map();
  for (const s of plan.scenes) {
    if (s.narration && !voices.has(s.narration.key)) voices.set(s.narration.key, await decodeAudio(await read(s.narration.key)));
  }
  const mixed = await mixSoundtrack(ctxFactory, plan, { music: settings.music, sfx: settings.sfx, voice: settings.voice }, voices);
  return encodeWav(mixed);
}
