import type { VoiceoverClip } from "./types";
export function clipGain(clip: VoiceoverClip, globalFrame: number): number {
  const local = globalFrame - clip.from;
  if (local < 0 || local >= clip.durationInFrames) return 0;
  const fadeIn = clip.fadeInFrames ? Math.min(1, local / clip.fadeInFrames) : 1;
  const fadeOut = clip.fadeOutFrames ? Math.min(1, (clip.durationInFrames - 1 - local) / clip.fadeOutFrames) : 1;
  return clip.volume * Math.max(0, fadeIn) * Math.max(0, fadeOut);
}
export function mixedGains(clips: VoiceoverClip[], globalFrame: number): Record<string, number> {
  const gains = clips.map((c) => [c.id, clipGain(c, globalFrame)] as const);
  const divisor = Math.max(1, gains.reduce((sum, [, gain]) => sum + gain, 0));
  return Object.fromEntries(gains.map(([id, gain]) => [id, gain / divisor]));
}
