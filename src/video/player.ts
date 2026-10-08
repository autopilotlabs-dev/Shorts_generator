// Drives preview playback and real-time recording of the canvas + soundtrack.
import fixWebmDuration from "fix-webm-duration";
import { totalDuration, type StoryPlan } from "../../shared/types";
import type { Mix, SoundEngine } from "../audio/engine";
import type { Renderer, RenderOptions } from "../render/renderer";

export interface PlayerHooks {
  onTime(t: number, total: number): void;
  onEnd(): void;
}

export interface Recording {
  blob: Blob;
  mime: string;
  ext: "mp4" | "webm";
}

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function pickMime(): string {
  return MIME_CANDIDATES.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) ?? "";
}

export class Player {
  private raf = 0;
  private t0 = 0;
  playing = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private renderer: Renderer,
    private sound: SoundEngine,
    private hooks: PlayerHooks,
  ) {}

  draw(plan: StoryPlan, t: number, opts: RenderOptions) {
    this.renderer.render(plan, t, opts);
    this.hooks.onTime(t, totalDuration(plan));
  }

  async play(plan: StoryPlan, opts: RenderOptions, mix: Mix, from = 0): Promise<void> {
    this.stop();
    await document.fonts.ready;
    await this.sound.resume();
    const total = totalDuration(plan);
    if (from >= total - 0.05) from = 0;
    this.t0 = this.sound.play(plan, mix, from);
    this.playing = true;
    return new Promise((resolve) => {
      const tick = () => {
        if (!this.playing) return resolve();
        const t = Math.max(0, this.sound.ctx.currentTime - this.t0);
        this.draw(plan, Math.min(t, total), opts);
        if (t >= total + 0.15) {
          this.playing = false;
          this.hooks.onEnd();
          return resolve();
        }
        this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.sound.stop();
  }

  /** Plays the plan from the start while recording canvas + audio. */
  async record(plan: StoryPlan, opts: RenderOptions, mix: Mix): Promise<Recording> {
    const mime = pickMime();
    if (!mime) throw new Error("This browser cannot record video (MediaRecorder unsupported). Try Chrome, Edge or Firefox.");
    await document.fonts.ready;
    await this.sound.resume();
    // Paint the first frame before capture starts so the video doesn't open on a blank canvas.
    this.draw(plan, 0, opts);
    const video = this.canvas.captureStream(30);
    const stream = new MediaStream([...video.getVideoTracks(), ...this.sound.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: this.canvas.width >= 1080 ? 12_000_000 : 6_000_000,
      audioBitsPerSecond: 192_000,
    });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start(250);
    const began = performance.now();
    await this.play(plan, opts, mix, 0);
    rec.stop();
    await stopped;
    const elapsedMs = performance.now() - began;
    video.getTracks().forEach((t) => t.stop());
    const type = mime.split(";")[0];
    let blob = new Blob(chunks, { type });
    // MediaRecorder WebM files have no duration header, which breaks seeking in many players.
    if (type === "video/webm") blob = await fixWebmDuration(blob, elapsedMs, { logger: false });
    return { blob, mime: type, ext: type === "video/mp4" ? "mp4" : "webm" };
  }
}
