"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";

import { FPS, HEIGHT, WIDTH, type ResolvedAssets, type SceneDsl } from "@/lib/scene/schema";
import { SceneView } from "@/remotion/SceneView";

export function ScenePlayer({ dsl, assets }: { dsl: SceneDsl; assets: ResolvedAssets }) {
  const inputProps = useMemo(() => ({ dsl, assets, assetMode: "url" as const }), [dsl, assets]);
  return (
    <Player
      component={SceneView}
      inputProps={inputProps}
      durationInFrames={dsl.durationFrames}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      fps={FPS}
      controls
      style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    />
  );
}
