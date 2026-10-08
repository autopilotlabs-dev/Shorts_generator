// Mixes the full soundtrack (score + SFX + narration) offline into one AudioBuffer.
// The browser uses its native OfflineAudioContext (preview); the render worker uses
// node-web-audio-api's. Remotion then plays the result as a single audio track.
import { SoundEngine, type Mix, type VoiceBank } from "./audio";
import { totalDuration, type StoryPlan } from "./types";

export const SAMPLE_RATE = 48000;
/** Extra seconds after the last frame so the reverb tail isn't cut off mid-fade. */
export const AUDIO_TAIL = 0.6;

export type OfflineContextFactory = (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

export async function mixSoundtrack(createContext: OfflineContextFactory, plan: StoryPlan, mix: Mix, voices: VoiceBank): Promise<AudioBuffer> {
  const length = Math.ceil((totalDuration(plan) + AUDIO_TAIL) * SAMPLE_RATE);
  const ctx = createContext(2, length, SAMPLE_RATE);
  new SoundEngine(ctx).play(plan, mix, 0, voices, 0);
  return ctx.startRendering();
}

/** 16-bit PCM WAV bytes from an AudioBuffer (works in browsers and Node). */
export function encodeWav(buf: AudioBuffer): Uint8Array {
  const ch = Math.min(2, buf.numberOfChannels);
  const n = buf.length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const str = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + n * ch * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  str(36, "data");
  out.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      out.setInt16(o, Math.round(v * 32767), true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}
