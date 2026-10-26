import { checkAnimation } from "@/lib/algorithm/animation/check";
import { AlgorithmAnimationV2Schema, type AlgorithmAnimationV2 } from "@/lib/algorithm/animation/schema";
import type { VoiceTimeline } from "@/lib/algorithm/voice/timeline";
import type { ChatMessage, TokenUsage } from "@/lib/ninerouter/client";

import type { JobContext } from "./job-types";
import { describeIssues, generateStructured } from "./llm-structured";

// Sinh animation V2 với vòng sửa máy (spec animation-engine §8): lỗi schema và lỗi của `checkAnimation` được trả lại cho LLM.
export async function generateAnimationV2(input: { model: string; messages: ChatMessage[]; timeline: VoiceTimeline; ctx: JobContext }): Promise<{ content: AlgorithmAnimationV2; model: string; usage: TokenUsage; repairRounds: number; warnings: string[] }> {
  let warnings: string[] = [];
  const result = await generateStructured<AlgorithmAnimationV2>({
    label: "Animation V2", model: input.model, messages: input.messages, ctx: input.ctx, temperature: 0.3,
    parse: (raw) => {
      const parsed = AlgorithmAnimationV2Schema.safeParse(raw);
      if (!parsed.success) return { ok: false, problems: describeIssues(parsed.error) };
      const checked = checkAnimation(parsed.data, input.timeline);
      if (checked.errors.length) return { ok: false, problems: checked.errors };
      warnings = checked.warnings;
      return { ok: true, data: parsed.data };
    },
  });
  return { content: result.data, model: result.model, usage: result.usage, repairRounds: result.repairRounds, warnings };
}
