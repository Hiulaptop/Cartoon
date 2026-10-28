import { Composition, getInputProps, registerRoot } from "remotion";
import { SHOWCASE, type ShowcaseProps } from "@/lib/animation/types";
import { AnimationShowcase } from "./AnimationShowcase";

function ShowcaseRoot() {
  const props = getInputProps<ShowcaseProps>();
  if (!props.draft) return null;
  return <Composition id="AnimationShowcase" component={AnimationShowcase} defaultProps={props} width={SHOWCASE.width} height={SHOWCASE.height} fps={SHOWCASE.fps} durationInFrames={SHOWCASE.frames} />;
}
registerRoot(ShowcaseRoot);
