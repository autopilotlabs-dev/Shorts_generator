// Browser implementation of the renderer's Platform (canvas factory + image cache).
import type { CanvasLike, Drawable, Platform } from "@/lib/engine/renderer";

const images = new Map<string, HTMLImageElement>();

export const browserPlatform: Platform = {
  createCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c as CanvasLike;
  },
  image(src): Drawable | null {
    let img = images.get(src);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.src = src;
      images.set(src, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  },
};

/** Resolves once every image in `srcs` has loaded (or failed). */
export function preloadImages(srcs: string[]): Promise<void> {
  return Promise.all(
    srcs.map((src) => {
      browserPlatform.image(src);
      const img = images.get(src)!;
      return img.complete ? Promise.resolve() : new Promise<void>((r) => ((img.onload = () => r()), (img.onerror = () => r())));
    }),
  ).then(() => {});
}
