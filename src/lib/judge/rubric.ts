import * as z from "zod";

// TV-14 (FCC Public Notice FCC 97-321, https://transition.fcc.gov/Bureaus/Cable/Public_Notices/1997/fcc97321.html, tra 2026-10-21):
// "This program contains some material that many parents would find unsuitable for children under 14 years of age."
// "This program contains one or more of the following: intense violence (V), intense sexual situations (S),
// strong coarse language (L), or intensely suggestive dialogue (D)."
export const RUBRIC_VERSION = "rubric-v1";
export const JUDGE_PASS_AVG = 3.5; // spec §6: ngưỡng khởi điểm; đổi thì bump RUBRIC_VERSION

// Họ model: chữ cái đầu sau tiền tố nhà cung cấp. "ag/gemini-3-flash" -> "gemini", "cc/claude-x" -> "claude".
export function modelFamily(id: string): string {
  const name = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return /^[a-z]+/i.exec(name)?.[0].toLowerCase() ?? name.toLowerCase();
}

// Trả true nếu cùng họ và được phép (ngoại lệ tạm); ném lỗi nếu cùng họ mà không được phép.
export function assertDifferentFamily(writer: string, judge: string): boolean {
  if (modelFamily(writer) !== modelFamily(judge)) return false;
  if (process.env.LLM_JUDGE_ALLOW_SAME_FAMILY === "true") return true;
  throw new Error(`Giám khảo (${judge}) cùng họ với model viết (${writer}); đặt LLM_JUDGE_MODEL khác họ (spec §6) hoặc LLM_JUDGE_ALLOW_SAME_FAMILY=true`);
}

const score = z.int().min(1).max(5);
const block = z.object({ violated: z.boolean(), reason: z.string() });

export const judgeSchema = z.object({
  blocks: z.object({ age_rating: block, ad_safe: block }),
  scores: z.object({
    humor: z.array(z.object({ beat: z.string(), reasoning: z.string(), score })),
    story: z.object({ reasoning: z.string(), score }),
    fidelity: z.object({ reasoning: z.string(), score }),
  }),
  feedback: z.string(),
});
export type JudgeResult = z.output<typeof judgeSchema>;

export function evaluateJudge(r: JudgeResult): { verdict: "pass" | "fail"; average: number | null; blocked: string[] } {
  const blocked = (Object.entries(r.blocks) as [string, { violated: boolean }][]).filter(([, b]) => b.violated).map(([id]) => id);
  const values = [...r.scores.humor.map((h) => h.score), r.scores.story.score, r.scores.fidelity.score];
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const pass = blocked.length === 0 && average !== null && average >= JUDGE_PASS_AVG;
  return { verdict: pass ? "pass" : "fail", average, blocked };
}
