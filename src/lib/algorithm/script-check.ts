import type { AlgorithmScriptV1 } from "./contracts";
import { findCodeIssues } from "./code-check";

export const HOOK_MAX_LINES = 5;
// Phần truyện (đoạn phim mở đầu có nhân vật) là các cảnh đầu có assetKeys; phần giảng phía sau không vẽ asset (user chốt 2026-10-25).
export const STORY_MAX_SCENES = 2;
export const STORY_MAX_SECONDS = 25;
// Mỗi cảnh truyện có đúng một key bối cảnh (tiền tố cố định để bước gán asset biết phải là `bg`) và tối đa 4 nhân vật/vật thể (số StoryScene vẽ được).
export const STORY_BACKGROUND_PREFIX = "nen_";
export const STORY_MAX_ACTORS = 4;

// Số cảnh đầu liên tiếp có assetKeys = số cảnh của phần truyện.
export function storySceneCount(script: AlgorithmScriptV1): number {
  const index = script.scenes.findIndex((scene) => scene.assetKeys.length === 0);
  return index === -1 ? script.scenes.length : index;
}

// Luật kiểm máy cho kịch bản do LLM sinh. Số phụ đề phải bằng số câu thoại (phụ đề i hiển thị câu thoại i, voice dựa vào đó);
// cảnh đầu tiên là hook và phải có dấu hiệu ngữ điệu (? ! ...) để văn nói/TTS có lên xuống giọng (user yêu cầu 2026-10-25).
export function checkScriptRules(script: AlgorithmScriptV1): string[] {
  const problems: string[] = [];
  for (const scene of script.scenes) {
    if (scene.subtitles.length !== scene.dialogue.length) {
      problems.push(`scenes[${scene.id}]: có ${scene.dialogue.length} câu thoại nhưng ${scene.subtitles.length} phụ đề; subtitles.length phải bằng dialogue.length (phụ đề thứ i là bản hiển thị của câu thoại thứ i)`);
    }
    if (scene.code.trim()) problems.push(`scenes[${scene.id}]: code phải là chuỗi rỗng; bài giảng không hiển thị code`);
    problems.push(...findCodeIssues(`scenes[${scene.id}].dialogue`, scene.dialogue.join("\n")), ...findCodeIssues(`scenes[${scene.id}].subtitles`, scene.subtitles.join("\n")));
  }
  const story = storySceneCount(script);
  if (story === 0) problems.push(`scenes[${script.scenes[0]?.id}] là cảnh mở đầu (phần truyện): phải có assetKeys gồm nhân vật, vật thể và một bối cảnh trong truyện`);
  if (story > STORY_MAX_SCENES) problems.push(`phần truyện có ${story} cảnh đầu mang assetKeys; tối đa ${STORY_MAX_SCENES} cảnh, các cảnh giảng phía sau phải có assetKeys = []`);
  const storySeconds = script.scenes.slice(0, story).reduce((total, scene) => total + scene.seconds, 0);
  if (storySeconds > STORY_MAX_SECONDS) problems.push(`phần truyện dài ${storySeconds} giây; tối đa ${STORY_MAX_SECONDS} giây, hãy kể ngắn lại`);
  for (const scene of script.scenes.slice(0, story)) {
    const backgrounds = scene.assetKeys.filter((key) => key.startsWith(STORY_BACKGROUND_PREFIX));
    const actors = scene.assetKeys.length - backgrounds.length;
    if (backgrounds.length !== 1) problems.push(`scenes[${scene.id}] là cảnh truyện: cần đúng một key bối cảnh bắt đầu bằng "${STORY_BACKGROUND_PREFIX}" (hiện có ${backgrounds.length})`);
    if (actors < 1 || actors > STORY_MAX_ACTORS) problems.push(`scenes[${scene.id}] là cảnh truyện: cần 1 đến ${STORY_MAX_ACTORS} key nhân vật/vật thể ngoài bối cảnh (hiện có ${actors})`);
  }
  for (const scene of script.scenes.slice(story)) {
    if (scene.assetKeys.length) problems.push(`scenes[${scene.id}] là cảnh giảng (sau phần truyện): assetKeys phải rỗng; phần giảng dùng hình ảnh học thuật, không vẽ nhân vật`);
  }
  const hook = script.scenes[0];
  if (hook) {
    if (hook.dialogue.length === 0) problems.push(`scenes[${hook.id}] là cảnh hook: phải có lời thoại`);
    if (hook.dialogue.length > HOOK_MAX_LINES) problems.push(`scenes[${hook.id}] là cảnh hook: tối đa ${HOOK_MAX_LINES} câu thoại (hiện ${hook.dialogue.length}); hook phải ngắn gọn`);
    if (hook.dialogue.length > 0 && !hook.dialogue.some((line) => /[?!]|\.\.\.|…/.test(line))) {
      problems.push(`scenes[${hook.id}] là cảnh hook: cần có ngữ điệu; dùng ? cho câu hỏi lên giọng, ! để nhấn điểm bất ngờ, ... để ngập ngừng tạo hồi hộp`);
    }
  }
  return problems;
}
