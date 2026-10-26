"use client";

import { Player } from "@remotion/player";

import type { PlaybackAudioCue, PlaybackCaption, SceneAssets } from "@/lib/algorithm/animation/playback";
import { AlgorithmAnimationSchema } from "@/lib/algorithm/animation/schema";
import type { CueWindow } from "@/lib/algorithm/animation/simulate";
import { AlgorithmVideo } from "@/remotion/algorithm/video";

// Dữ liệu phát lại dựng ở server từ timeline voice đã duyệt (phụ đề theo cue, cửa sổ cue cho cảnh V2, audio theo URL).
export type AnimationPlayback = { audio: PlaybackAudioCue[]; captions: PlaybackCaption[]; cues: CueWindow[]; sceneAssets: SceneAssets };

export function AnimationPreview({ value, playback }: { value: unknown; playback?: AnimationPlayback }) {
  const parsed = AlgorithmAnimationSchema.safeParse(value);
  if (!parsed.success) return <p className="text-sm text-muted-foreground">Preview cần animation có schema hợp lệ.</p>;
  const inputProps = { animation: parsed.data, audio: playback?.audio ?? [], captions: playback?.captions ?? [], cues: playback?.cues ?? [], sceneAssets: playback?.sceneAssets ?? [], audioMode: "url" as const };
  return <div className="w-full max-w-sm overflow-hidden rounded-lg border bg-black">
    <Player component={AlgorithmVideo} inputProps={inputProps} durationInFrames={parsed.data.durationFrames} compositionWidth={parsed.data.width} compositionHeight={parsed.data.height} fps={parsed.data.fps} controls style={{ width: "100%", aspectRatio: "9 / 16" }} />
  </div>;
}
