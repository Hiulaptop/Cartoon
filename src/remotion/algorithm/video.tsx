import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";

import type { SceneAssets } from "@/lib/algorithm/animation/playback";
import { isAnimationV2, type AlgorithmAnimation } from "@/lib/algorithm/animation/schema";
import type { CueWindow } from "@/lib/algorithm/animation/simulate";

import { PALETTE } from "./palette";
import { SceneV2 } from "./scene-v2";
import { StoryScene } from "./story-scene";

export { PALETTE };

export type AlgorithmAudioCue = { src: string; from: number; durationInFrames: number };
// Phụ đề theo từng cue (frame tuyệt đối). Có `captions` thì mỗi phụ đề chỉ hiện đúng khoảng cue đang đọc; không có thì V1 giữ cách cũ (hiện cả cảnh).
export type AlgorithmCaption = { text: string; from: number; durationInFrames: number };
// `audioMode`: "static" = tệp trong publicDir (render), "url" = URL tuyệt đối/tương đối (preview trong Player); áp dụng cho cả audio và ảnh asset.
// `cues` là cửa sổ cue cho cảnh V2. `sceneAssets` là ảnh asset đã gắn của từng cảnh: cảnh có asset là cảnh truyện, vẽ toàn màn hình bằng StoryScene.
export type AlgorithmVideoProps = { animation: AlgorithmAnimation; audio?: AlgorithmAudioCue[]; captions?: AlgorithmCaption[]; cues?: CueWindow[]; sceneAssets?: SceneAssets; audioMode?: "static" | "url" };

type SceneProps = { title: string; narration: string[]; subtitles: string[]; code: string; values: string[]; highlightIndex: number | null; hideCaption?: boolean };

const subtitleStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 180,
  left: 72,
  right: 72,
  padding: "20px 26px",
  borderRadius: 16,
  background: "rgba(31, 41, 55, 0.94)",
  color: PALETTE.paper,
  textAlign: "center",
  fontSize: 34,
  lineHeight: 1.3,
  whiteSpace: "pre-line",
};

const Scene: React.FC<SceneProps> = ({ title, narration, subtitles, code, values, highlightIndex, hideCaption }) => {
  const caption = hideCaption ? [] : subtitles.length > 0 ? subtitles : narration;
  return (
    <AbsoluteFill style={{ background: PALETTE.paper, color: PALETTE.ink, padding: 72, fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: 120, height: 10, borderRadius: 5, background: PALETTE.progress, marginBottom: 28 }} />
      <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.15 }}>{title}</div>
      {values.length > 0 && <div style={{ display: "flex", gap: 12, marginTop: 70, flexWrap: "wrap" }}>
        {values.map((value, index) => {
          const focused = index === highlightIndex;
          return <div key={index} style={{
            minWidth: 110, minHeight: 110, padding: 18, display: "grid", placeItems: "center", borderRadius: 16,
            background: focused ? PALETTE.focus : PALETTE.surface,
            border: `4px solid ${focused ? PALETTE.progress : PALETTE.line}`,
            color: PALETTE.ink, fontSize: 40, fontWeight: 700,
          }}>{value}</div>;
        })}
      </div>}
      {code && <pre style={{
        whiteSpace: "pre-wrap", overflowWrap: "anywhere", marginTop: 64, padding: 30, borderRadius: 18,
        background: PALETTE.surface, border: `3px solid ${PALETTE.line}`, borderLeft: `10px solid ${PALETTE.valid}`,
        color: PALETTE.ink, fontSize: 27, lineHeight: 1.4,
      }}>{code}</pre>}
      {caption.length > 0 && <div style={subtitleStyle}>{caption.join("\n")}</div>}
    </AbsoluteFill>
  );
};

export const AlgorithmVideo: React.FC<AlgorithmVideoProps> = ({ animation, audio = [], captions = [], cues = [], sceneAssets = [], audioMode = "static" }) => {
  // Cảnh có asset đã gắn là cảnh truyện mở đầu; còn lại là cảnh giảng học thuật.
  const storyItems = (sceneId: string) => sceneAssets.find((item) => item.sceneId === sceneId)?.items ?? [];
  return <AbsoluteFill>
    {isAnimationV2(animation)
      ? animation.scenes.map((scene) => <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationFrames}>
        {storyItems(scene.id).length
          ? <StoryScene title={scene.title} items={storyItems(scene.id)} mode={audioMode} />
          : <SceneV2 scene={scene} windows={cues.filter((cue) => cue.cueId.startsWith(`${scene.id}:`))} />}
      </Sequence>)
      : animation.scenes.map((scene) => <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationFrames}>
        {storyItems(scene.id).length
          ? <StoryScene title={scene.title} items={storyItems(scene.id)} mode={audioMode} />
          : <Scene title={scene.title} narration={scene.narration} subtitles={scene.subtitles} code={scene.code} values={scene.values} highlightIndex={scene.highlightIndex} hideCaption={captions.length > 0} />}
      </Sequence>)}
    {captions.map((caption) => <Sequence key={`${caption.from}:${caption.text}`} from={caption.from} durationInFrames={caption.durationInFrames}>
      <div style={subtitleStyle}>{caption.text}</div>
    </Sequence>)}
    {audio.map((cue) => <Sequence key={`${cue.src}:${cue.from}`} from={cue.from} durationInFrames={cue.durationInFrames}>
      <Html5Audio src={audioMode === "url" ? cue.src : staticFile(cue.src)} />
    </Sequence>)}
  </AbsoluteFill>;
};
