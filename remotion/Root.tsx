import { Composition, type CalculateMetadataFunction } from "remotion";
import { totalDuration } from "../lib/engine/types";
import { HorrorShort, type HorrorShortProps } from "./HorrorShort";

export const FPS = 30;
export const COMPOSITION_ID = "HorrorShort";

export const dimensions = (quality: 720 | 1080) => ({ width: quality, height: Math.round((quality * 16) / 9) });

export const calculateMetadata: CalculateMetadataFunction<HorrorShortProps> = ({ props }) => ({
  durationInFrames: Math.max(1, Math.ceil(totalDuration(props.plan) * FPS)),
  ...dimensions(props.settings.quality),
});

const placeholder: HorrorShortProps = {
  plan: { title: "Preview", scenes: [{ id: "s1", text: "Something is behind you.", visual: "figure", mood: "terror", duration: 10, effects: ["zoom", "fog"], sfx: [] }] },
  settings: { captionStyle: "bold", showTitle: true, quality: 1080 },
  soundtrackUrl: null,
  media: {},
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id={COMPOSITION_ID}
    component={HorrorShort}
    fps={FPS}
    width={1080}
    height={1920}
    durationInFrames={300}
    defaultProps={placeholder}
    calculateMetadata={calculateMetadata}
  />
);
