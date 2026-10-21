import { SUBTITLE } from "@/lib/validation/subtitle";

import type { ScenePlan } from "./plan";
import { characterId } from "./refs";
import { FPS, type SceneDialogue } from "./schema";

// Lớp 1 cho thoại của cảnh: đúng nguyên văn và thứ tự kế hoạch; mỗi câu đọc kịp (nguồn Netflix, xem M4).
export function checkDialogue(plan: ScenePlan, dialogue: SceneDialogue[]): string[] {
  const issues: string[] = [];
  const ordered = [...dialogue].sort((a, b) => a.from - b.from);

  if (ordered.length !== plan.lines.length) {
    issues.push(`Số câu thoại là ${ordered.length}, kế hoạch có ${plan.lines.length}; không được thêm/bớt thoại`);
  }
  plan.lines.forEach((line, i) => {
    const got = ordered[i];
    if (!got) return;
    if (got.text !== line.text) issues.push(`Câu ${i + 1} phải đúng nguyên văn "${line.text}" (đang là "${got.text}")`);
    if (got.speaker !== characterId(line.speaker)) issues.push(`Câu ${i + 1} phải do ${line.speaker} nói (speaker "${characterId(line.speaker)}")`);
  });
  ordered.forEach((d, i) => {
    const seconds = (d.to - d.from) / FPS;
    const cps = d.text.length / seconds;
    if (seconds < SUBTITLE.minSeconds) issues.push(`Câu ${i + 1} hiện ${seconds.toFixed(2)}s, tối thiểu ${SUBTITLE.minSeconds.toFixed(2)}s`);
    if (seconds > SUBTITLE.maxSeconds) issues.push(`Câu ${i + 1} hiện ${seconds.toFixed(1)}s, tối đa ${SUBTITLE.maxSeconds}s`);
    if (cps > SUBTITLE.maxCharsPerSecond) issues.push(`Câu ${i + 1} đọc ${cps.toFixed(1)} ký tự/giây, tối đa ${SUBTITLE.maxCharsPerSecond}`);
  });
  return issues;
}
