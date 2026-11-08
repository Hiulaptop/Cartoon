import React from "react";
import { Composition, registerRoot } from "remotion";
import { FORMAT, type RenderInput } from "@/lib/automation/contracts";
import { AutomationThumbnail, AutomationVideo } from "./video";

const Root = () => <>
  <Composition id="AutomationExplainer" component={AutomationVideo} width={FORMAT.width} height={FORMAT.height} fps={FORMAT.fps} durationInFrames={1} defaultProps={{ input: { version: 1, storyboard: { version: 1, title: "", previewSceneId: "", scenes: [] }, cues: [], durationFrames: 1, assetMode: "static" } as RenderInput }} calculateMetadata={({ props }) => ({ durationInFrames: (props as { input: RenderInput }).input.durationFrames })} />
  <Composition id="AutomationThumbnail" component={AutomationThumbnail} defaultProps={{ title: "" }} width={FORMAT.width} height={FORMAT.height} fps={FORMAT.fps} durationInFrames={1} />
</>;
registerRoot(Root);
