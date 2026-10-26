import React from "react";
import { Composition, registerRoot } from "remotion";

import { AlgorithmVideo } from "./video";

const Root: React.FC = () => <Composition
  id="AlgorithmVideo"
  component={AlgorithmVideo}
  durationInFrames={90}
  fps={30}
  width={1080}
  height={1920}
  defaultProps={{ audio: [], captions: [], animation: { version: 1, width: 1080, height: 1920, fps: 30, durationFrames: 90, scenes: [{ id: "placeholder", from: 0, durationFrames: 90, title: "", narration: [], subtitles: [], code: "", values: [], highlightIndex: null }] } }}
  calculateMetadata={({ props }) => ({ durationInFrames: props.animation.durationFrames, fps: props.animation.fps, width: props.animation.width, height: props.animation.height })}
/>;

registerRoot(Root);
