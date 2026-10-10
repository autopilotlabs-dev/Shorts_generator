// 2D layer on top of each 3D scene: captions, title card, vignette, grain, flicker,
// glitch and fades. Kept in HTML/CSS so text is always crisp.
import { AbsoluteFill } from "remotion";
import { captionPages } from "../../lib/engine/renderer";
import type { ResolvedShort } from "../../lib/short3d/spec";
import { clamp01, flickerAt, noise } from "./util";

type Scene = ResolvedShort["scenes"][number];

const FONTS = {
  bold: { family: "Oswald, Impact, sans-serif", size: 0.088, upper: true },
  typewriter: { family: "'Special Elite', 'Courier New', monospace", size: 0.07, upper: false },
  creepy: { family: "Creepster, Oswald, sans-serif", size: 0.094, upper: true },
} as const;
const HIGHLIGHT = "#ff2e47";

function Captions({ scene, t, style, width }: { scene: Scene; t: number; style: keyof typeof FONTS; width: number }) {
  const font = FONTS[style];
  const raw = scene.narration.trim().split(/\s+/).filter(Boolean);
  if (!raw.length) return null;
  const words = font.upper ? raw.map((w) => w.toUpperCase()) : raw;
  // Word timings follow the narration clip (or the scene) weighted by word length.
  const lead = 0.25;
  const span = Math.max(0.5, (scene.narrationDuration ?? scene.duration - 0.45) - 0.05);
  const weights = words.map((w) => 1 + w.length * 0.12);
  const total = weights.reduce((a, b) => a + b, 0);
  const starts: number[] = [];
  let acc = lead;
  for (const w of weights) {
    starts.push(acc);
    acc += (w / total) * span;
  }
  let current = 0;
  for (let i = 0; i < words.length; i++) if (t >= starts[i]) current = i;
  const pages = captionPages(words);
  let first = 0;
  let page = pages[0];
  for (const p of pages) {
    if (current < first + p.length) {
      page = p;
      break;
    }
    first += p.length;
  }
  const size = Math.round(width * font.size);
  return (
    <div
      style={{
        position: "absolute",
        left: "8%",
        right: "8%",
        top: "62%",
        transform: "translateY(-50%)",
        textAlign: "center",
        fontFamily: font.family,
        fontSize: size,
        lineHeight: 1.15,
        letterSpacing: style === "bold" ? "0.01em" : 0,
        color: "#f4f1ea",
        WebkitTextStroke: `${Math.max(2, size * 0.09)}px rgba(0,0,0,0.9)`,
        paintOrder: "stroke fill",
        textShadow: "0 6px 18px rgba(0,0,0,0.6)",
      }}
    >
      {page.map((w, i) => {
        const idx = first + i;
        const shown = clamp01((t - starts[idx]) / 0.1);
        const active = idx === current;
        const pop = active ? 1.06 + 0.1 * (1 - clamp01((t - starts[idx]) / 0.15)) : 1;
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              margin: `0 ${size * 0.12}px`,
              opacity: shown,
              transform: `scale(${pop})`,
              color: active ? HIGHLIGHT : undefined,
              textShadow: active ? `0 0 ${size * 0.35}px ${HIGHLIGHT}` : undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

function Title({ title, t, width }: { title: string; t: number; width: number }) {
  const dur = 2.4;
  if (t > dur) return null;
  const a = t < 0.3 ? t / 0.3 : t > dur - 0.5 ? (dur - t) / 0.5 : 1;
  return (
    <div style={{ position: "absolute", top: "16%", left: "6%", right: "6%", textAlign: "center", opacity: a }}>
      <div
        style={{
          fontFamily: "Creepster, Oswald, sans-serif",
          fontSize: Math.round(width * 0.12),
          color: HIGHLIGHT,
          textShadow: `0 0 ${width * 0.04}px ${HIGHLIGHT}, 0 4px 10px #000`,
          transform: `translateX(${noise(t * 20, 4) * 3}px)`,
          lineHeight: 1,
        }}
      >
        {title.toUpperCase()}
      </div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 600, fontSize: Math.round(width * 0.028), color: "#f4f1ea", marginTop: width * 0.02, letterSpacing: "0.18em" }}>
        A SHORT HORROR STORY
      </div>
    </div>
  );
}

export function Overlay({ short, scene, index, t, frame, width, height }: { short: ResolvedShort; scene: Scene; index: number; t: number; frame: number; width: number; height: number }) {
  const fx = new Set(scene.effects);
  const last = index === short.scenes.length - 1;
  // Fades: in at the start of each scene, a short dip at cuts, long fade at the very end.
  let black = 0;
  const fadeIn = index === 0 ? 0.6 : 0.25;
  if (t < fadeIn) black = 1 - t / fadeIn;
  const left = scene.duration - t;
  if (last && left < 0.8) black = Math.max(black, 1 - left / 0.8);
  else if (!last && left < 0.15) black = Math.max(black, 1 - left / 0.15);
  const flick = fx.has("flicker") ? flickerAt(t, index + 7) : 1;
  const flash = fx.has("lightning") ? Math.max(0, 1 - Math.abs(((t + 0.3) % 3.1) - 0.15) * 8) : 0;
  const glitching = fx.has("glitch") && (Math.sin(t * 2.3 + index) > 0.85 || t < 0.25);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* vignette */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, transparent 45%, rgba(0,0,0,${scene.mood === "terror" ? 0.75 : 0.6}) 100%)` }} />
      {/* film grain */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "screen" }}>
        <filter id={`grain${index}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 9} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain${index})`} />
      </svg>
      {flick < 1 && <AbsoluteFill style={{ background: `rgba(0,0,0,${(1 - flick) * 0.8})` }} />}
      {flash > 0 && <AbsoluteFill style={{ background: `rgba(220,230,255,${flash * 0.7})` }} />}
      {glitching && (
        <AbsoluteFill
          style={{
            background: `linear-gradient(transparent ${40 + noise(t * 30, 1) * 30}%, rgba(255,40,70,0.25) 0, rgba(60,220,255,0.18) ${48 + noise(t * 30, 2) * 30}%, transparent 0)`,
            mixBlendMode: "screen",
            transform: `translateX(${noise(t * 40, 3) * 12}px)`,
          }}
        />
      )}
      {short.showTitle && index === 0 && <Title title={short.title} t={t} width={width} />}
      <Captions scene={scene} t={t} style={short.captionStyle} width={width} />
      {black > 0 && <AbsoluteFill style={{ background: `rgba(0,0,0,${clamp01(black)})` }} />}
    </AbsoluteFill>
  );
}
