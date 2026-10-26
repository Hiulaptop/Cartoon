export const VOICE_FPS = 30;
export const VOICE_SPEED_MIN = 1.0;
export const VOICE_SPEED_MAX = 1.5;
export const VOICE_SPEED_DEFAULT = 1.25;
// Giá trị chốt bằng nghe thử ngày 2026-10-25 (docs/superpowers/spikes/2026-10-23-algorithm-video.md).
export const VOICE_GAP_FRAMES = 6; // khoảng nghỉ sau mỗi cue
export const VOICE_MAX_SPOKEN_CHARS = 300; // độ dài tối đa mỗi cue
export const VOICE_DEFAULT_VOICE = "Adam";
export const TTS_ENGINE_VERSION = "vieneu-3.8.3-turbo";
export const MAX_VIDEO_FRAMES = 5400;
// Profile phụ đề tiếng Việt của nhánh algorithm (spec algorithm-video §14); không dùng chung với src/lib/validation/subtitle.ts.
export const SUBTITLE_PROFILE = { maxCharsPerSecond: 17, maxLineChars: 42, maxLines: 2, minFrames: 25, maxFrames: 210 } as const;
