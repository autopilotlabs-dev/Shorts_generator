// Browser implementation of the renderer's Platform (canvas factory + image cache by storage key).
import type { CanvasLike, Drawable, Platform } from "@/lib/engine/renderer";

/** Browser URL for a stored object (session-checked by /api/media). */
export const mediaSrc = (key: string) => `/api/media/${key}`;

const images = new Map<string, HTMLImageElement>();

export const browserPlatform: Platform = {
  createCanvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c as CanvasLike;
  },
  image(key): Drawable | null {
    let img = images.get(key);
    if (!img) {
      img = new Image();
      img.decoding = "async";
      img.src = mediaSrc(key);
      images.set(key, img);
    }
    return img.complete && img.naturalWidth ? img : null;
  },
};
