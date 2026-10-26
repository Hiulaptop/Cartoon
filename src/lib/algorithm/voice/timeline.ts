import type { AlgorithmScriptV1 } from "@/lib/algorithm/contracts";

import { VOICE_FPS, VOICE_GAP_FRAMES } from "./constants";
import { cueId, type AlgorithmVoiceV1 } from "./contract";

export type ClipTiming = { cueId: string; durationMs: number };
export type CueTiming = { cueId: string; sceneId: string; from: number; audioFrames: number; frames: number };
export type SceneTiming = { sceneId: string; from: number; durationFrames: number; cues: CueTiming[] };
export type VoiceTimeline = { totalFrames: number; scenes: SceneTiming[] };

// Cảnh có thoại: tổng frame các cue (audio + khoảng nghỉ). Cảnh không thoại: `seconds` của kịch bản.
export function buildVoiceTimeline(script: AlgorithmScriptV1, voice: AlgorithmVoiceV1, clips: ClipTiming[]): VoiceTimeline {
  const known = new Set(voice.cues.map((cue) => cue.id));
  let cursor = 0;
  const scenes: SceneTiming[] = [];
  for (const scene of script.scenes) {
    const sceneFrom = cursor;
    const cues: CueTiming[] = [];
    scene.dialogue.forEach((_, index) => {
      const id = cueId(scene.id, index);
      const clip = clips.find((item) => item.cueId === id);
      if (!known.has(id) || !clip) throw new Error(`Thiếu clip hoặc cue cho ${id}`);
      const audioFrames = Math.ceil((clip.durationMs * VOICE_FPS) / 1000);
      const frames = audioFrames + VOICE_GAP_FRAMES;
      cues.push({ cueId: id, sceneId: scene.id, from: cursor, audioFrames, frames });
      cursor += frames;
    });
    if (cues.length === 0) cursor += scene.seconds * VOICE_FPS;
    scenes.push({ sceneId: scene.id, from: sceneFrom, durationFrames: cursor - sceneFrom, cues });
  }
  return { totalFrames: cursor, scenes };
}

// Chỉ dùng các trường chung của mọi phiên bản animation (V1, V2).
export type TimedAnimation = { durationFrames: number; scenes: { id: string; from: number; durationFrames: number }[] };

export function checkAnimationAgainstTimeline(animation: TimedAnimation, timeline: VoiceTimeline): string[] {
  const issues: string[] = [];
  if (animation.durationFrames !== timeline.totalFrames) issues.push(`durationFrames ${animation.durationFrames} khác timeline voice ${timeline.totalFrames}`);
  if (animation.scenes.length !== timeline.scenes.length) issues.push(`Animation có ${animation.scenes.length} cảnh, timeline có ${timeline.scenes.length}`);
  timeline.scenes.forEach((expected, index) => {
    const actual = animation.scenes[index];
    if (!actual) return;
    if (actual.id !== expected.sceneId) issues.push(`Cảnh thứ ${index + 1} phải có id ${expected.sceneId}, nhận ${actual.id}`);
    if (actual.from !== expected.from || actual.durationFrames !== expected.durationFrames) issues.push(`Cảnh ${expected.sceneId} phải from=${expected.from}, durationFrames=${expected.durationFrames}; nhận ${actual.from}/${actual.durationFrames}`);
  });
  return issues;
}
