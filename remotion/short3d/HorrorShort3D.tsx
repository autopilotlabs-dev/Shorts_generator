// The 3D cartoon horror short: one React Three Fiber scene per story beat, a 2D overlay
// for captions/effects, and a pre-mixed soundtrack (narration + score + SFX).
import { Audio } from "@remotion/media";
import { ThreeCanvas } from "@remotion/three";
import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
// Resolved at bundle time to the short's generated registry of hand-written scenes.
import { CUSTOM_SCENES } from "short3d-custom-scenes";
import type { ResolvedShort } from "../../lib/short3d/spec";
import { loadFonts } from "../fonts";
import { Character } from "./characters";
import { Overlay } from "./Overlay";
import { PropView } from "./props";
import { SetView } from "./sets";
import { CameraRig, Fog, Lighting, Weather } from "./stage";

export interface HorrorShort3DProps {
  short: ResolvedShort;
  /** Canvas resolution relative to the composition (< 1 for quick previews). */
  drawScale?: number;
  [key: string]: unknown;
}

export interface CustomSceneProps {
  /** Seconds since the scene started. */
  t: number;
  /** Scene length in seconds. */
  duration: number;
}

type Scene = ResolvedShort["scenes"][number];

function SceneView({ short, scene, index, drawScale }: { short: ResolvedShort; scene: Scene; index: number; drawScale: number }) {
  const frame = useCurrentFrame(); // relative to the Sequence
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const Custom = scene.custom ? CUSTOM_SCENES[scene.custom] : undefined;
  return (
    <AbsoluteFill>
      <ThreeCanvas width={Math.round(width * drawScale)} height={Math.round(height * drawScale)} style={{ width, height }} gl={{ antialias: true }} dpr={1}>
        <Lighting scene={scene} t={t} />
        <Fog scene={scene} />
        <SetView scene={scene} t={t} />
        {scene.props.map((p, i) => (
          <PropView key={i} prop={p} t={t} />
        ))}
        {scene.actors.map((a) => (
          <Character key={a.id} actor={a} t={t} sceneDuration={scene.duration} />
        ))}
        {Custom && <Custom t={t} duration={scene.duration} />}
        <Weather scene={scene} t={t} />
        <CameraRig scene={scene} t={t} duration={scene.duration} />
      </ThreeCanvas>
      <Overlay short={short} scene={scene} index={index} t={t} frame={frame} width={width} height={height} />
    </AbsoluteFill>
  );
}

export const HorrorShort3D: React.FC<HorrorShort3DProps> = ({ short, drawScale = 1 }) => {
  const { fps } = useVideoConfig();
  const [handle] = useState(() => delayRender("Loading fonts"));
  useEffect(() => {
    loadFonts()
      .catch((e) => console.error(e))
      .finally(() => continueRender(handle));
  }, [handle]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {short.scenes.map((scene, i) => (
        <Sequence key={scene.id} from={Math.round(scene.start * fps)} durationInFrames={Math.max(1, Math.round(scene.duration * fps))} name={scene.id}>
          <SceneView short={short} scene={scene} index={i} drawScale={drawScale} />
        </Sequence>
      ))}
      {short.soundtrack ? <Audio src={staticFile(short.soundtrack)} /> : null}
    </AbsoluteFill>
  );
};
