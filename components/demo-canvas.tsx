"use client";
import { useEffect, useRef } from "react";
import { browserPlatform } from "@/lib/client/platform";
import { planLocally } from "@/lib/engine/planner";
import { Renderer } from "@/lib/engine/renderer";
import { SAMPLES } from "@/lib/engine/samples";
import { totalDuration } from "@/lib/engine/types";

/** Silent, looping live render of a sample story (landing page). */
export function DemoCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const renderer = new Renderer(canvas, browserPlatform);
    const plan = planLocally(SAMPLES[0].story, 24, SAMPLES[0].title);
    const total = totalDuration(plan);
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      renderer.render(plan, ((performance.now() - start) / 1000) % total, { captionStyle: "bold", showTitle: true });
      raf = requestAnimationFrame(tick);
    };
    document.fonts.ready.then(() => (raf = requestAnimationFrame(tick)));
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={405} height={720} className="block h-full w-full" aria-label="Animated sample short" />;
}
