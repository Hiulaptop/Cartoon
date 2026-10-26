import type { AlgorithmScriptV1 } from "@/lib/algorithm/contracts";

import { SUBTITLE_PROFILE, VOICE_FPS } from "./constants";
import { cueId, type AlgorithmVoiceV1 } from "./contract";
import type { VoiceTimeline } from "./timeline";

export type VoiceIssue = { kind: "structure" | "script" | "spoken" | "subtitle"; cueId?: string; sceneId?: string; message: string };

const READABLE = /[\p{L}\s,.?!:;'"()\-…]/u;

// Văn nói phải đọc được thành chữ: không chữ số, không ký hiệu. Ký tự cụ thể được nới/siết sau khi nghe thử.
export function checkSpokenText(text: string): string | null {
  if (!text.trim()) return "Văn nói rỗng";
  if (/\d/.test(text)) return "Văn nói còn chữ số; hãy viết thành chữ";
  const bad = [...text].find((char) => !READABLE.test(char));
  return bad ? `Văn nói còn ký tự không đọc được: ${bad}` : null;
}

// kind "script": lỗi của kịch bản (phụ đề lệch thoại), chặn duyệt voice nhưng không chặn sửa voice; "structure"/"spoken": lỗi của chính voice.
export function checkVoiceAgainstScript(voice: AlgorithmVoiceV1, script: AlgorithmScriptV1): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  const sceneIds = new Set(script.scenes.map((scene) => scene.id));
  const expected = new Set<string>();
  for (const scene of script.scenes) {
    scene.dialogue.forEach((_, index) => expected.add(cueId(scene.id, index)));
    if (scene.subtitles.length !== scene.dialogue.length) {
      issues.push({ kind: "script", sceneId: scene.id, message: `Cảnh ${scene.id}: ${scene.dialogue.length} câu thoại nhưng ${scene.subtitles.length} phụ đề; sửa kịch bản để hai mảng bằng nhau` });
    }
  }
  const seen = new Set<string>();
  for (const cue of voice.cues) {
    if (seen.has(cue.id)) issues.push({ kind: "structure", cueId: cue.id, message: `Cue ${cue.id} bị trùng` });
    seen.add(cue.id);
    if (!expected.has(cue.id) || cue.id !== cueId(cue.sceneId, cue.dialogueIndex)) issues.push({ kind: "structure", cueId: cue.id, message: `Cue ${cue.id} không khớp câu thoại nào của kịch bản` });
    const problem = checkSpokenText(cue.spokenText);
    if (problem) issues.push({ kind: "spoken", cueId: cue.id, message: `${cue.id}: ${problem}` });
  }
  for (const id of expected) if (!seen.has(id)) issues.push({ kind: "structure", cueId: id, message: `Thiếu cue ${id}` });
  const overrideIds = new Set<string>();
  for (const scene of voice.scenes) {
    if (!sceneIds.has(scene.sceneId)) issues.push({ kind: "structure", sceneId: scene.sceneId, message: `Tốc độ ghi đè cho cảnh không tồn tại: ${scene.sceneId}` });
    if (overrideIds.has(scene.sceneId)) issues.push({ kind: "structure", sceneId: scene.sceneId, message: `Cảnh ${scene.sceneId} bị ghi đè tốc độ hai lần` });
    overrideIds.add(scene.sceneId);
  }
  return issues;
}

// Cảnh báo, không chặn duyệt: phụ đề phải đọc được trong đúng khoảng thời gian cue hiển thị (spec §5.5).
export function checkSubtitleTiming(script: AlgorithmScriptV1, timeline: VoiceTimeline): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  for (const scene of script.scenes) {
    const timing = timeline.scenes.find((item) => item.sceneId === scene.id);
    if (!timing || scene.subtitles.length !== scene.dialogue.length) continue;
    timing.cues.forEach((cue, index) => {
      const text = scene.subtitles[index];
      const lines = text.split("\n");
      const seconds = cue.frames / VOICE_FPS;
      const length = text.replace(/\n/g, "").length;
      const problems: string[] = [];
      if (lines.length > SUBTITLE_PROFILE.maxLines || lines.some((line) => line.length > SUBTITLE_PROFILE.maxLineChars)) problems.push(`quá ${SUBTITLE_PROFILE.maxLines} dòng hoặc quá ${SUBTITLE_PROFILE.maxLineChars} ký tự/dòng`);
      if (length / seconds > SUBTITLE_PROFILE.maxCharsPerSecond) problems.push(`${(length / seconds).toFixed(1)} ký tự/giây (tối đa ${SUBTITLE_PROFILE.maxCharsPerSecond})`);
      if (cue.frames < SUBTITLE_PROFILE.minFrames || cue.frames > SUBTITLE_PROFILE.maxFrames) problems.push(`thời lượng ${cue.frames} frame ngoài ${SUBTITLE_PROFILE.minFrames}–${SUBTITLE_PROFILE.maxFrames}`);
      if (problems.length) issues.push({ kind: "subtitle", cueId: cue.cueId, sceneId: scene.id, message: `Phụ đề cue ${cue.cueId}: ${problems.join("; ")}` });
    });
  }
  return issues;
}
