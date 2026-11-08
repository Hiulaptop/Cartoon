import React, { useEffect, useState } from "react";
import { AbsoluteFill, Html5Audio, Sequence, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import type { PreparedEpisode } from "../../lib/local-video/binary-search/contracts";
import { ArrayView } from "./array-view";
import { IntervalView, LinearView } from "./interval-view";
import { ExplanationView } from "./explanation-view";

let fontPromise: Promise<void> | undefined;
function fonts() {
  return fontPromise ??= new FontFace("BinaryGeist", `url("${staticFile("fonts/Geist-Regular.woff2")}")`).load().then((face) => { document.fonts.add(face); }).then(() => document.fonts.ready).then(() => undefined);
}
export function BinarySearchEnglishVideo({ episode }: { episode: PreparedEpisode | null }) {
  const [handle] = useState(() => episode ? delayRender("Local English video font") : null);
  useEffect(() => { if (handle !== null) fonts().then(() => continueRender(handle)).catch(cancelRender); }, [handle]);
  const frame = useCurrentFrame();
  if (!episode) return <AbsoluteFill style={{ background: "#1a1a19", color: "#f0efec", justifyContent: "center", alignItems: "center", fontSize: 55 }}>Prepared episode required — no narration loaded</AbsoluteFill>;
  const cue = episode.cues.find((c) => frame >= c.from && frame < c.from + c.durationInFrames) ?? episode.cues[episode.cues.length - 1];
  const progress = Math.max(0, Math.min(1, (frame - cue.audioStartFrame) / Math.max(1, cue.audioFrames - 1)));
  const beat = [...cue.visual.beats].reverse().find((b) => progress >= b.at) ?? cue.visual.beats[0];
  const trace = cue.visual.example ? episode.traces[cue.visual.example] : null;
  const step = trace && beat ? trace.steps[beat.stateIndex] : null;
  const caption = episode.captions.find((c) => frame >= c.from && frame < c.to);
  const chapter = episode.chapters.find((ch) => ch.id === cue.chapterId)!;
  const linearCues = episode.cues.filter((c) => c.visual.kind === "linear");
  const linearSmall = cue.id === "c05" || cue.id === "c06";
  const linearStart = linearSmall ? linearCues[0].audioStartFrame : linearCues[2].audioStartFrame;
  const linearEnd = linearSmall ? linearCues[1].audioStartFrame + linearCues[1].audioFrames - 1 : linearCues[4].audioStartFrame + linearCues[4].audioFrames - 1;
  return <AbsoluteFill style={{ background: "#1a1a19", color: "#f0efec", fontFamily: "BinaryGeist", padding: "48px 150px", fontVariantNumeric: "tabular-nums" }}>
    {episode.cues.map((c) => <Sequence key={c.id} from={c.audioStartFrame} durationInFrames={c.audioFrames} layout="none"><Html5Audio src={staticFile(c.src)} /></Sequence>)}
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 23, color: "#c3c2b7", letterSpacing: 1 }}><span>ALGORITHMS, MADE VISIBLE</span><span>ENGLISH • BINARY SEARCH</span></div>
    <div style={{ fontSize: 53, marginTop: 25, marginBottom: 45 }}>{chapter.title}</div>
    <div style={{ height: 620 }}>
      {cue.visual.kind === "linear" ? <LinearView small={linearSmall} progress={(frame - linearStart) / (linearEnd - linearStart)} />
        : step && beat && trace ? cue.visual.kind === "large-search" ? <IntervalView step={step} phase={beat.phase} /> : <ArrayView step={step} phase={beat.phase} target={trace.target} />
          : <ExplanationView kind={cue.visual.kind} cueId={cue.id} />}
    </div>
    <div style={{ position: "absolute", left: 180, right: 180, bottom: 72, height: 120, display: "flex", justifyContent: "center", alignItems: "center", textAlign: "center", fontSize: 38, lineHeight: 1.4, background: "#111110", borderRadius: 10, padding: "10px 25px", whiteSpace: "pre-line" }}>{caption?.lines.join("\n") ?? ""}</div>
    <div style={{ position: "absolute", left: 150, bottom: 30, fontSize: 18, color: "#c3c2b7" }}>Sorted input • Position checks, not elapsed time • AI narration: Ryan</div>
    <div style={{ position: "absolute", left: 0, bottom: 0, height: 6, width: `${(frame + 1) / episode.durationInFrames * 100}%`, background: "#3987e5" }} />
  </AbsoluteFill>;
}
