import * as z from "zod";

import type { ChatMessage } from "@/lib/ninerouter/client";
import type { ScenePlan } from "@/lib/scene/plan";
import type { SceneDsl } from "@/lib/scene/schema";

import { judgeSchema, RUBRIC_VERSION } from "./rubric";

export function judgeMessages(plan: ScenePlan, dsl: SceneDsl): ChatMessage[] {
  const system = [
    `You are a strict, fair reviewer of a scene from a 2D teen cartoon (audience 14-18). Rubric ${RUBRIC_VERSION}.`,
    "Evaluate the scene JSON against the plan. For each criterion first write short reasoning, then give the score (G-Eval style).",
    "HARD BLOCKS (set violated=true if ANY applies):",
    "- age_rating: exceeds TV-14, i.e. intense violence, sexual situations, strong coarse language, or intensely suggestive dialogue.",
    "- ad_safe: not fully advertiser-friendly on YouTube: sustained profanity, violence/blood without context, adult themes, shock content, dangerous acts, hateful or demeaning content, drugs, firearms focus, sensitive events, dishonest behaviour, tobacco, or content inappropriate for kids/families.",
    "SCORES (integers 1-5, 5 best):",
    "- humor: one entry per joke listed in the plan (use its beat id). Benign violation: something wrong yet harmless; setup and payoff must be clear. Skip (empty array) if the plan has no joke.",
    "- story: clear scene arc, setup then payoff, pacing fits the plan.",
    "- fidelity: includes the planned characters, location and actions; adds nothing off-topic.",
    "Reply with ONLY a JSON object matching this JSON Schema (fill `feedback` with concrete fixes, empty string if none):",
    JSON.stringify(z.toJSONSchema(judgeSchema)),
  ].join("\n");

  const user = [
    `PLAN:\n${JSON.stringify(plan, null, 2)}`,
    `SCENE JSON:\n${JSON.stringify(dsl)}`,
    "The JSON already passed deterministic checks (schema, asset references, dialogue wording and reading speed).",
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
