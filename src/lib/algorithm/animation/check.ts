import { checkAnimationAgainstTimeline, type VoiceTimeline } from "@/lib/algorithm/voice/timeline";

import { isAnimationV2, type AlgorithmAnimation } from "./schema";
import { simulateScene, type CueWindow } from "./simulate";

export type AnimationCheck = { errors: string[]; warnings: string[] };

export function cueWindowsOf(timeline: VoiceTimeline, sceneId: string): CueWindow[] {
  return (timeline.scenes.find((scene) => scene.sceneId === sceneId)?.cues ?? []).map((cue) => ({ cueId: cue.cueId, from: cue.from, frames: cue.frames }));
}

// Kiểm tra tất định cho animation mọi phiên bản (spec animation-engine §7). Lỗi chặn duyệt/render; cảnh báo thì không.
export function checkAnimation(animation: AlgorithmAnimation, timeline: VoiceTimeline): AnimationCheck {
  const errors = checkAnimationAgainstTimeline(animation, timeline);
  const warnings: string[] = [];
  const ids = new Set<string>();
  for (const scene of animation.scenes) {
    if (ids.has(scene.id)) errors.push(`Cảnh ${scene.id} bị trùng id`);
    ids.add(scene.id);
    if (scene.from + scene.durationFrames > animation.durationFrames) errors.push(`Cảnh ${scene.id} vượt tổng thời lượng animation`);
  }
  if (!isAnimationV2(animation)) {
    for (const scene of animation.scenes) {
      if (scene.highlightIndex !== null && scene.highlightIndex >= scene.values.length) errors.push(`Cảnh ${scene.id}: highlightIndex vượt số values`);
    }
    return { errors, warnings };
  }
  for (const scene of animation.scenes) {
    const windows = cueWindowsOf(timeline, scene.id);
    errors.push(...simulateScene(scene, windows).errors);
    if (!scene.array) continue;
    if (scene.steps.length === 0) {
      warnings.push(`Cảnh ${scene.id} có mảng nhưng không có bước nào (hình sẽ đứng yên)`);
      continue;
    }
    if (scene.steps.every((step) => step.ops.every((op) => op.op === "note" || op.op === "clear"))) warnings.push(`Cảnh ${scene.id}: chỉ có ghi chú, mảng không chuyển động`);
    const timed = timeline.scenes.find((item) => item.sceneId === scene.id);
    for (const cue of timed?.cues ?? []) {
      if (cue.audioFrames > 180 && !scene.steps.some((step) => step.cueId === cue.cueId)) warnings.push(`Cảnh ${scene.id}: cue ${cue.cueId} dài hơn 6 giây nhưng không có bước nào`);
    }
  }
  return { errors, warnings };
}
