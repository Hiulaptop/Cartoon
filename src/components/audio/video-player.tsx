"use client";
import { useState } from "react";
import { Player } from "@remotion/player";
import { VideoComposition, type VideoProps } from "@/remotion/VideoComposition";
export function VoiceoverVideoPlayer({ scenes, voiceover }: Pick<VideoProps, "scenes" | "voiceover">) {
  const [error, setError] = useState("");
  return <div>
    <Player component={VideoComposition} inputProps={{ scenes, voiceover, assetMode: "url", onAudioError: setError }} durationInFrames={Math.max(1, scenes.reduce((sum, s) => sum + s.dsl.durationFrames, 0))} fps={30} compositionWidth={1920} compositionHeight={1080} controls style={{ width: "100%", aspectRatio: "16/9" }} errorFallback={() => <p role="alert">Không phát được preview; kiểm tra audio và asset.</p>} />
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>;
}
