import { Composition } from "remotion";

import { FPS, HEIGHT, WIDTH } from "@/lib/scene/schema";

import { calculateVideoMetadata, VideoComposition, type VideoProps } from "./VideoComposition";

const defaultProps: VideoProps = { scenes: [], assetMode: "static" };

export const Root: React.FC = () => (
  <Composition
    id="Video"
    component={VideoComposition}
    width={WIDTH}
    height={HEIGHT}
    fps={FPS}
    durationInFrames={FPS}
    defaultProps={defaultProps}
    calculateMetadata={calculateVideoMetadata}
  />
);
