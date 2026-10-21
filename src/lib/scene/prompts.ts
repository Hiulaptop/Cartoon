import * as z from "zod";

import type { ChatMessage } from "@/lib/ninerouter/client";

import type { Catalog } from "./catalog";
import type { ScenePlan } from "./plan";
import { characterId } from "./refs";
import { FPS, sceneDslSchema } from "./schema";

export type SceneWriteInput = {
  plan: ScenePlan;
  catalog: Catalog;
  isFirst: boolean;
  isLast: boolean;
  feedback?: string; // lỗi lớp 1, nhận xét giám khảo hoặc lý do người loại
  previous?: string; // JSON lần trước để sửa
};

export function sceneMessages(input: SceneWriteInput): ChatMessage[] {
  const { plan, catalog } = input;
  const used = [plan.location, ...plan.characters].map((r) => r.replace(/^@/, "").split(".")[0]);
  const assets = used
    .map((name) => catalog.get(name))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => `- @${a.name} (${a.kind}) approved states: ${[...a.variants.keys()].join(", ")}`)
    .join("\n");
  const frames = Math.round(plan.seconds * FPS);

  const system = [
    "You turn one planned scene of a 2D cartoon into a scene JSON for a renderer. Output ONLY the JSON object.",
    `Canvas 1920x1080 at ${FPS} fps. All times are FRAMES (30 frames = 1 second). x,y are fractions of the frame; y is the character's FEET line (use ~0.9); height is a fraction of frame height (0.5-0.7 for a character).`,
    `Set "version" to 1 and "durationFrames" to about ${frames} (at least enough to show every dialogue line).`,
    `Characters: id = asset name without "chr_" truncated to 24 chars (e.g. ${plan.characters[0] ? characterId(plan.characters[0]) : "minh"}); ref = "@chr_name" with NO state; change expression with "states" keyframes (first keyframe at frame 0) using only approved states below.`,
    "Dialogue: copy each line's text EXACTLY and in the same order as the plan, set `speaker` to that character's id, give each line a [from,to) window with no overlap, long enough to read at <= 20 characters per second (at least 25 frames, at most 210 frames).",
    "Use moves/camera sparingly to show the planned actions. A talking character should have talk_a and talk_b approved for the mouth animation; otherwise keep them still.",
    `Transition: ${input.isFirst ? 'in = "fade"' : 'in = "cut"'}, ${input.isLast ? 'out = "fade"' : 'out = "cut"'}, frames = 12.`,
    "Do not include a \"$schema\" key or any key not in the schema.",
    "Use ONLY these assets and states:",
    assets,
    `JSON Schema:\n${JSON.stringify(z.toJSONSchema(sceneDslSchema, { io: "input" }))}`,
  ].join("\n");

  const user = [
    `PLAN:\n${JSON.stringify({ ...plan, characters: plan.characters.map((c) => ({ ref: c, id: characterId(c) })) }, null, 2)}`,
    input.previous ? `PREVIOUS VERSION (revise it):\n${input.previous}` : "",
    input.feedback ? `FIX THESE PROBLEMS:\n${input.feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
