export type VoiceoverClip = {
  id: string; takeId: string; from: number; trimBefore: number; durationInFrames: number;
  volume: number; fadeInFrames: number; fadeOutFrames: number; allowOverlap: boolean;
  label: string; speakerRef?: string;
};
export type VoiceoverTimelineV1 = { version: 1; fps: 30; visualFingerprint: string; clips: VoiceoverClip[] };
export type AudioSourceMeta = { filePath: string; sha256: string; bytes: number; durationSeconds: number; sampleRate: number; channels: number; codec: string };
export type ResolvedVoiceover = { timeline: VoiceoverTimelineV1; sources: Record<string, AudioSourceMeta> };
export type VisualSnapshot = {
  scriptId: string; scriptVersion: number; scriptHash: string;
  scenes: { id: string; position: number; dslHash: string; durationFrames: number }[];
  fps: 30; width: 1920; height: 1080;
};
export type RenderAudioRequest = { mode: "silent" } | { mode: "voiceover"; timelineVersionId: string; timelineHash: string; takeHashes: Record<string, string> };
export type RenderRequestV1 = {
  version: 1; renderId: string; videoId: string; visual: VisualSnapshot; visualHash: string;
  imageFiles: { path: string; sha256: string }[]; audio: RenderAudioRequest;
};
