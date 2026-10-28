import React from "react";
import { Composition, getInputProps, registerRoot } from "remotion";
import { BostonScene, type BostonProps } from "./scene";

function Root() {
  const input = getInputProps<BostonProps>();
  if (!input.images) return null;
  return <Composition id="BostonTeaParty" component={BostonScene} width={1920} height={1080} fps={30} durationInFrames={900} defaultProps={input} />;
}
registerRoot(Root);
