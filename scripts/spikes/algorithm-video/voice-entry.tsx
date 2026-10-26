import React from "react";
import { AbsoluteFill, Composition, Html5Audio, Sequence, registerRoot, staticFile } from "remotion";

type Props = { cues: { src: string; from: number; durationInFrames: number }[] };

const Probe: React.FC<Props> = ({ cues }) => (
  <AbsoluteFill style={{ background: "#FFF8E7", color: "#1F2937", fontSize: 60, padding: 72 }}>
    voice audio probe
    {cues.map((cue) => <Sequence key={cue.src} from={cue.from} durationInFrames={cue.durationInFrames}>
      <Html5Audio src={staticFile(cue.src)} />
    </Sequence>)}
  </AbsoluteFill>
);

registerRoot(() => <Composition id="VoiceProbe" component={Probe} durationInFrames={300} fps={30} width={1080} height={1920} defaultProps={{ cues: [] }} />);
