// The video itself, as a Remotion composition. Used by <Player> in the editor and by
// @remotion/renderer in the render worker, so preview and export are identical.
import { Audio } from "@remotion/media";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFonts } from "./fonts";
import { Renderer, type CanvasLike, type Platform } from "../lib/engine/renderer";
import type { ProjectSettings, StoryPlan } from "../lib/engine/types";

export interface HorrorShortProps {
  plan: StoryPlan;
  settings: Pick<ProjectSettings, "captionStyle" | "showTitle" | "quality">;
  /** Pre-mixed soundtrack (WAV). Null renders silently (e.g. while the preview mix is computing). */
  soundtrackUrl: string | null;
  /** Storage key -> fetchable URL for scene images. */
  media: Record<string, string>;
  /** Canvas resolution relative to the composition; < 1 makes the in-app preview cheaper to draw. */
  drawScale?: number;
  // Index signature required by Remotion's inputProps typing.
  [key: string]: unknown;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${src}`));
    img.src = src;
  });
}

export const HorrorShort: React.FC<HorrorShortProps> = ({ plan, settings, soundtrackUrl, media, drawScale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<Map<string, HTMLImageElement> | null>(null);

  // Block rendering until fonts and every scene image are ready (no-op in the Player).
  const imageKeys = useMemo(() => [...new Set(plan.scenes.map((s) => s.imageKey).filter(Boolean) as string[])], [plan]);
  const [handle] = useState(() => delayRender("Loading fonts and images"));
  useEffect(() => {
    let alive = true;
    Promise.all([
      loadFonts(),
      Promise.all(imageKeys.filter((k) => media[k]).map(async (k) => [k, await loadImage(media[k])] as const)),
    ])
      .then(([, loaded]) => alive && setImages(new Map(loaded)))
      .catch((err) => {
        console.error(err);
        if (alive) setImages(new Map());
      })
      .finally(() => continueRender(handle));
    return () => {
      alive = false;
    };
  }, [imageKeys, media, handle]);

  const renderer = useMemo(() => {
    if (!images) return null;
    const platform: Platform = {
      createCanvas(w, h) {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        return c as CanvasLike;
      },
      image: (key) => images.get(key) ?? null,
    };
    return (canvas: HTMLCanvasElement) => new Renderer(canvas, platform);
  }, [images]);

  // One Renderer per (canvas, image set); drawing is synchronous so each frame is complete before capture.
  const instance = useRef<{ canvas: HTMLCanvasElement; factory: (c: HTMLCanvasElement) => Renderer; r: Renderer } | null>(null);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !renderer) return;
    if (!instance.current || instance.current.canvas !== canvas || instance.current.factory !== renderer) {
      instance.current = { canvas, factory: renderer, r: renderer(canvas) };
    }
    instance.current.r.render(plan, frame / fps, { captionStyle: settings.captionStyle, showTitle: settings.showTitle });
  }, [frame, fps, plan, settings.captionStyle, settings.showTitle, renderer]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <canvas
        ref={canvasRef}
        width={Math.round(width * drawScale)}
        height={Math.round(height * drawScale)}
        style={{ width: "100%", height: "100%" }}
      />
      {soundtrackUrl ? <Audio src={soundtrackUrl} /> : null}
    </AbsoluteFill>
  );
};
