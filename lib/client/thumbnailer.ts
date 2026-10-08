// Small static scene thumbnails for the scene list (same renderer as the video).
import { Renderer } from "@/lib/engine/renderer";
import type { StoryPlan } from "@/lib/engine/types";
import { browserPlatform } from "./platform";

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
    this.renderer.render({ title: "", scenes }, start + scenes[index].duration * 0.6, {
      captionStyle: "bold",
      showTitle: false,
      captions: false,
      transitions: false,
    });
    target.getContext("2d")!.drawImage(this.canvas, 0, 0, target.width, target.height);
  }
}
