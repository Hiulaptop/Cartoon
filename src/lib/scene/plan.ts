import { estimateLineSeconds } from "@/lib/validation/subtitle";
import type { ScriptV1 } from "@/lib/script/schema";

import { FPS, MAX_SCENE_FRAMES } from "./schema";

export type ScenePlan = {
  position: number; // thứ tự cảnh trong video, bắt đầu từ 1
  beatId: string;
  role: string;
  part: [number, number]; // [chỉ số phần, tổng số phần] khi một nhịp bị chia
  location: string;
  characters: string[];
  lines: { speaker: string; text: string }[];
  actions: string[];
  gag?: ScriptV1["beats"][number]["gag"];
  summary: string;
  seconds: number; // đã đủ để đọc hết thoại
};

const MAX_SINGLE_SECONDS = 25;
const TARGET_PART_SECONDS = 20;
const GAP_SECONDS = 0.4;

export function planScenes(script: ScriptV1): ScenePlan[] {
  const plans: ScenePlan[] = [];
  for (const beat of script.beats) {
    const parts = beat.seconds <= MAX_SINGLE_SECONDS ? 1 : Math.ceil(beat.seconds / TARGET_PART_SECONDS);
    const perPart = Math.ceil(beat.lines.length / parts) || 1;
    for (let p = 0; p < parts; p++) {
      const lines = beat.lines.slice(p * perPart, (p + 1) * perPart);
      const needed = lines.reduce((s, l) => s + estimateLineSeconds(l.text) + GAP_SECONDS, 0);
      const seconds = Math.min(Math.max(Math.round(beat.seconds / parts), Math.ceil(needed), 2), MAX_SCENE_FRAMES / FPS);
      plans.push({
        position: plans.length + 1,
        beatId: beat.id,
        role: beat.role,
        part: [p + 1, parts],
        location: beat.location,
        characters: beat.characters,
        lines,
        actions: beat.actions,
        gag: p === parts - 1 ? beat.gag : undefined, // payoff nằm ở phần cuối của nhịp
        summary: beat.summary,
        seconds,
      });
    }
  }
  return plans;
}
