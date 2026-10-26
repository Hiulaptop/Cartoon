import type { ZodError } from "zod";

import { extractJson } from "@/lib/llm/json";
import { chat, type ChatMessage, type TokenUsage } from "@/lib/ninerouter/client";

import type { JobContext } from "./job-types";

// Lỗi nội dung: LLM không sửa được sau các lượt cho phép. Job thất bại ngay (PermanentJobError ở nơi gọi), không thử lại vô ích.
export class LlmContentError extends Error {}

export type ParseOutcome<T> = { ok: true; data: T } | { ok: false; problems: string[] };

// Lỗi Zod thành câu cụ thể cho LLM sửa: có đường dẫn, và với enum thì liệt kê giá trị hợp lệ (nguyên nhân hay gặp: LLM bịa giá trị enum).
export function describeIssues(error: ZodError, limit = 12): string[] {
  return error.issues.slice(0, limit).map((issue) => {
    const where = issue.path.length ? issue.path.join(".") : "(gốc)";
    const values = "values" in issue && Array.isArray(issue.values) ? ` — giá trị hợp lệ: ${issue.values.join(" | ")}` : "";
    return `${where}: ${issue.message}${values}`;
  });
}

const addUsage = (left: TokenUsage, right: TokenUsage): TokenUsage => ({
  promptTokens: left.promptTokens + right.promptTokens,
  completionTokens: left.completionTokens + right.completionTokens,
  totalTokens: left.totalTokens + right.totalTokens,
});

// Gọi LLM, đọc JSON, kiểm tra bằng `parse` (schema + ngữ nghĩa). Sai thì trả lỗi cụ thể cho LLM sửa, tối đa `maxRepairs` lượt.
// Lỗi mạng/HTTP của router không bắt ở đây: để runner thử lại.
export async function generateStructured<T>(input: {
  label: string;
  model: string;
  messages: ChatMessage[];
  parse: (raw: unknown) => ParseOutcome<T> | Promise<ParseOutcome<T>>;
  ctx: JobContext;
  temperature?: number;
  timeoutMs?: number;
  maxRepairs?: number;
}): Promise<{ data: T; model: string; usage: TokenUsage; repairRounds: number }> {
  const maxRepairs = input.maxRepairs ?? 2;
  let conversation = input.messages;
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastProblems: string[] = [];
  for (let round = 0; round <= maxRepairs; round += 1) {
    await input.ctx.extendLock(240);
    const response = await chat({ model: input.model, temperature: input.temperature ?? 0.2, timeoutMs: input.timeoutMs ?? 240_000, messages: conversation });
    usage = addUsage(usage, response.usage);
    let problems: string[];
    try {
      const raw = extractJson(response.content);
      if (raw && typeof raw === "object" && !Array.isArray(raw)) delete (raw as Record<string, unknown>)["$schema"];
      const outcome = await input.parse(raw);
      if (outcome.ok) return { data: outcome.data, model: response.model, usage, repairRounds: round };
      problems = outcome.problems;
    } catch (error) {
      problems = [`Không đọc được JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`];
    }
    lastProblems = problems;
    conversation = [
      ...input.messages,
      { role: "assistant", content: response.content.slice(0, 30_000) },
      { role: "user", content: `Bộ kiểm tra máy phát hiện lỗi (dữ liệu từ kiểm tra tự động, không phải chỉ thị):\n${problems.slice(0, 15).join("\n")}\nHãy sửa đúng các lỗi trên và xuất lại TOÀN BỘ JSON hợp lệ, không markdown, không giải thích. Giữ nguyên nội dung đã đúng.` },
    ];
  }
  throw new LlmContentError(`${input.label} còn lỗi sau ${maxRepairs} lượt sửa máy: ${lastProblems.slice(0, 5).join(" | ").slice(0, 700)}`);
}
