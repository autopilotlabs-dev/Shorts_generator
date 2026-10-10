import { Composition, type CalculateMetadataFunction } from "remotion";
import { HorrorShort3D, type HorrorShort3DProps } from "./HorrorShort3D";

export const FPS = 30;
export const COMPOSITION_3D = "HorrorShort3D";

const calculateMetadata: CalculateMetadataFunction<HorrorShort3DProps> = ({ props }) => {
  const last = props.short.scenes.at(-1);
  const total = last ? last.start + last.duration : 1;
  const w = props.short.quality;
  return { durationInFrames: Math.max(1, Math.round(total * FPS)), width: w, height: Math.round((w * 16) / 9) };
};

export const Root3D: React.FC = () => (
  <Composition
    id={COMPOSITION_3D}
    component={HorrorShort3D}
    fps={FPS}
    width={720}
    height={1280}
    durationInFrames={300}
    calculateMetadata={calculateMetadata}
    defaultProps={{
      short: {
        title: "Preview",
        voice: "am_onyx",
        speed: 0.92,
        captionStyle: "bold",
        showTitle: true,
        quality: 720,
        music: 1,
        sfxVolume: 1,
        voiceVolume: 1,
        soundtrack: null,
        scenes: [
          {
            id: "s1",
            narration: "Something is under the bed.",
            duration: 4,
            start: 0,
            set: "bedroom",
            mood: "dread",
            keyLight: "lamp",
            flicker: true,
            fog: 0.3,
            weather: "none",
            camera: { shot: "medium", move: "dolly_in", intensity: 1 },
            actors: [{ id: "kid", character: "kid", x: 0, z: 0, facing: "camera", action: "scared", expression: "scared", start: 0, scale: 1, glowingEyes: false }],
            props: [],
            sfx: [],
            effects: [],
          },
        ],
      },
    }}
  />
);
