// Decode compressed audio (MP3 narration) on the server with node-web-audio-api.
import { OfflineAudioContext } from "node-web-audio-api";

export const SAMPLE_RATE = 48000;

export async function decodeAudio(data: Buffer | Uint8Array): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate: SAMPLE_RATE });
  const ab = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return (await ctx.decodeAudioData(ab)) as unknown as AudioBuffer;
}

export async function audioDuration(data: Buffer | Uint8Array): Promise<number> {
  return (await decodeAudio(data)).duration;
}
