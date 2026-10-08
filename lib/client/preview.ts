// Live in-browser preview: same renderer + sound engine as the server render,
// with narration clips decoded from their MP3s.
import { SoundEngine, type Mix, type VoiceBank } from "@/lib/engine/audio";
import { Renderer, type RenderOptions } from "@/lib/engine/renderer";
import { totalDuration, type StoryPlan } from "@/lib/engine/types";
import { browserPlatform, preloadImages } from "./platform";

export class PreviewPlayer {
  private renderer: Renderer;
  private audio: AudioContext | null = null;
  private engine: SoundEngine | null = null;
  private voices: VoiceBank = new Map();
  private raf = 0;
  private t0 = 0;
  playing = false;

  constructor(
    canvas: HTMLCanvasElement,
    private onTime: (t: number) => void,
    private onEnd: () => void,
  ) {
    this.renderer = new Renderer(canvas, browserPlatform);
  }

  draw(plan: StoryPlan, t: number, opts: RenderOptions) {
    this.renderer.render(plan, t, opts);
  }

  private async loadVoices(plan: StoryPlan) {
    const ctx = this.audio!;
    await Promise.all(
      plan.scenes.map(async (s) => {
        const url = s.narration?.url;
        if (!url || this.voices.has(url)) return;
        try {
          const buf = await (await fetch(url)).arrayBuffer();
          this.voices.set(url, await ctx.decodeAudioData(buf));
        } catch (err) {
          console.warn("Could not load narration", url, err);
        }
      }),
    );
  }

  async play(plan: StoryPlan, opts: RenderOptions, mix: Mix, from = 0) {
    this.stop();
    if (!this.audio) {
      this.audio = new AudioContext({ sampleRate: 48000 });
      this.engine = new SoundEngine(this.audio);
    }
    if (this.audio.state !== "running") await this.audio.resume();
    await Promise.all([
      document.fonts.ready,
      this.loadVoices(plan),
      preloadImages(plan.scenes.map((s) => s.image).filter(Boolean) as string[]),
    ]);
    const total = totalDuration(plan);
    if (from >= total - 0.05) from = 0;
    this.t0 = this.engine!.play(plan, mix, from, this.voices);
    this.playing = true;
    const tick = () => {
      if (!this.playing) return;
      const t = Math.max(0, this.audio!.currentTime - this.t0);
      this.draw(plan, Math.min(t, total), opts);
      this.onTime(Math.min(t, total));
      if (t >= total + 0.1) {
        this.playing = false;
        this.onEnd();
        return;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.engine?.stop();
  }

  dispose() {
    this.stop();
    this.audio?.close().catch(() => {});
  }
}

/** Renders small scene thumbnails off-screen. */
export class Thumbnailer {
  private canvas = document.createElement("canvas");
  private renderer: Renderer;

  constructor() {
    this.canvas.width = 108;
    this.canvas.height = 192;
    this.renderer = new Renderer(this.canvas, browserPlatform);
  }

  draw(plan: StoryPlan, index: number, target: HTMLCanvasElement) {
    // Render the scene at its real position so its seed (and look) match the video.
    const scenes = plan.scenes.slice(0, index + 1);
    const start = scenes.slice(0, -1).reduce((a, s) => a + s.duration, 0);
    const scene = scenes[index];
    this.renderer.render({ title: "", scenes }, start + scene.duration * 0.6, {
      captionStyle: "bold",
      showTitle: false,
      captions: false,
      transitions: false,
    });
    target.getContext("2d")!.drawImage(this.canvas, 0, 0, target.width, target.height);
  }
}
