import React from "react";
import { Composition, registerRoot } from "remotion";
import type { PreparedEpisode } from "../../lib/local-video/binary-search/contracts";
import { BinarySearchEnglishVideo } from "./video";

const defaultProps: { episode: PreparedEpisode | null } = { episode: null };
function Root() {
  return <Composition id="BinarySearchEnglish" component={BinarySearchEnglishVideo} width={1920} height={1080} fps={30} durationInFrames={30} defaultProps={defaultProps} calculateMetadata={({ props }) => ({ durationInFrames: props.episode?.durationInFrames ?? 30 })} />;
}
registerRoot(Root);
