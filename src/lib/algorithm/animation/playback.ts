import type { AlgorithmScriptV1 } from "@/lib/algorithm/contracts";
import type { VoiceTimeline } from "@/lib/algorithm/voice/timeline";

import type { CueWindow } from "./simulate";

export type PlaybackCaption = { text: string; from: number; durationInFrames: number };
export type PlaybackAudioCue = { src: string; from: number; durationInFrames: number };

// Phụ đề hiện đúng khoảng thời gian của cue tương ứng (kịch bản đã được kiểm: số phụ đề bằng số câu thoại).
export function buildCaptions(timeline: VoiceTimeline, script: AlgorithmScriptV1): PlaybackCaption[] {
  return timeline.scenes.flatMap((scene) => {
    const subtitles = script.scenes.find((item) => item.id === scene.sceneId)?.subtitles ?? [];
    return scene.cues.map((cue, index) => ({ text: subtitles[index] ?? "", from: cue.from, durationInFrames: cue.frames })).filter((caption) => caption.text);
  });
}

export function buildCueWindows(timeline: VoiceTimeline): CueWindow[] {
  return timeline.scenes.flatMap((scene) => scene.cues.map((cue) => ({ cueId: cue.cueId, from: cue.from, frames: cue.frames })));
}

export type SceneAssetKind = "bg" | "chr" | "prop" | "fx";
// `aspect` = rộng / cao của ảnh đã cắt sát, để cảnh truyện vẽ đúng tỉ lệ (đạo cụ dạng ngang không bị co vào ô vuông).
export type SceneAssetItem = { kind: SceneAssetKind; src: string; aspect: number };
export type SceneAssets = { sceneId: string; items: SceneAssetItem[] }[];
export type AssetFileBinding = { temporaryKey: string; kind: SceneAssetKind; filePath: string; aspect: number };

// Ảnh của từng cảnh lấy tất định từ assetKeys của kịch bản đã duyệt và binding đã gắn (không cần LLM chọn lại).
// `srcOf` đổi đường dẫn file trong DATA_DIR thành nguồn ảnh: URL /api/files (preview) hoặc đường dẫn trong publicDir (render).
export function buildSceneAssets(script: AlgorithmScriptV1, bindings: AssetFileBinding[], srcOf: (filePath: string) => string): SceneAssets {
  return script.scenes.map((scene) => {
    const seen = new Set<string>();
    const items: SceneAssetItem[] = [];
    for (const key of scene.assetKeys) {
      const binding = bindings.find((item) => item.temporaryKey === key);
      if (!binding || seen.has(binding.filePath)) continue;
      seen.add(binding.filePath);
      items.push({ kind: binding.kind, src: srcOf(binding.filePath), aspect: binding.aspect });
    }
    return { sceneId: scene.id, items };
  });
}

// `srcOf` quyết định nguồn audio: đường dẫn trong publicDir (render) hoặc URL /api/files (preview).
export function buildAudioCues(timeline: VoiceTimeline, srcOf: (cueId: string, order: number) => string): PlaybackAudioCue[] {
  let order = 0;
  return timeline.scenes.flatMap((scene) => scene.cues.map((cue) => {
    const item = { src: srcOf(cue.cueId, order), from: cue.from, durationInFrames: cue.audioFrames };
    order += 1;
    return item;
  }));
}
