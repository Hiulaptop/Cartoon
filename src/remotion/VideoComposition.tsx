import { AbsoluteFill, Sequence, type CalculateMetadataFunction } from "remotion";

import type { ResolvedAssets, SceneDsl } from "@/lib/scene/schema";

import { SceneView } from "./SceneView";

export type VideoProps = {
  scenes: { dsl: SceneDsl; assets: ResolvedAssets }[];
  assetMode: "static" | "url";
};

export const calculateVideoMetadata: CalculateMetadataFunction<VideoProps> = ({ props }) => ({
  durationInFrames: Math.max(1, props.scenes.reduce((sum, s) => sum + s.dsl.durationFrames, 0)),
});

// Các cảnh nối tiếp nhau; mờ vào/ra nằm trong từng cảnh (transition.fade), nên thời lượng = tổng các cảnh.
export const VideoComposition: React.FC<VideoProps> = ({ scenes, assetMode }) => {
  let offset = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {scenes.map((scene, i) => {
        const from = offset;
        offset += scene.dsl.durationFrames;
        return (
          <Sequence key={i} from={from} durationInFrames={scene.dsl.durationFrames}>
            <SceneView dsl={scene.dsl} assets={scene.assets} assetMode={assetMode} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
