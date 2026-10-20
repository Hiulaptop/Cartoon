import { Composition } from "remotion";
import { Probe } from "./Probe";

export const Root: React.FC = () => (
  <Composition id="Probe" component={Probe} durationInFrames={30 * 90} fps={30} width={1920} height={1080} />
);
