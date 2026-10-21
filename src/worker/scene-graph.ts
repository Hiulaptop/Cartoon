import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { evaluateJudge, judgeSchema, type JudgeResult } from "@/lib/judge/rubric";
import { judgeMessages } from "@/lib/judge/prompts";
import { extractJson } from "@/lib/llm/json";
import { chat } from "@/lib/ninerouter/client";
import type { Catalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import type { ScenePlan } from "@/lib/scene/plan";
import { sceneMessages } from "@/lib/scene/prompts";
import { parseSceneDsl, type SceneDsl } from "@/lib/scene/schema";
import { checkDialogue } from "@/lib/scene/subtitle-check";

export const MAX_REVISIONS = 2; // spec §5 bước 3
const CONCURRENCY = 3;

export type AttemptRecord = {
  round: number;
  stage: "layer1" | "judge";
  verdict: "pass" | "fail";
  detail: unknown; // layer1: { issues }; judge: { result, average, blocked }
  feedback: string;
  model: string;
};

export type SceneOutcome = {
  plan: ScenePlan;
  dsl?: SceneDsl;
  status: "pending" | "pass" | "fail";
  feedback?: string; // phản hồi cho lần viết kế tiếp
  history: AttemptRecord[];
};

export type GraphDeps = {
  catalog: Catalog;
  writerModel: string;
  judgeModel: string;
  checkpointer: PostgresSaver;
  // Lý do người loại theo position (khi sinh lại một cảnh).
  humanFeedback?: Record<number, string>;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const merge = (a: Record<number, SceneOutcome>, b: Record<number, SceneOutcome>) => ({ ...a, ...b });

const State = Annotation.Root({
  scenes: Annotation<Record<number, SceneOutcome>>({ reducer: merge, default: () => ({}) }),
  round: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});

export function buildSceneGraph(deps: GraphDeps) {
  const pending = (s: typeof State.State) => Object.values(s.scenes).filter((o) => o.status === "pending");

  // Node viết: viết (hoặc sửa) JSON cho mọi cảnh đang `pending`.
  const write = async (s: typeof State.State) => {
    const all = Object.values(s.scenes).sort((a, b) => a.plan.position - b.plan.position);
    const first = all[0]?.plan.position;
    const last = all[all.length - 1]?.plan.position;
    const results = await mapLimit(pending(s), CONCURRENCY, async (o) => {
      const feedback = [deps.humanFeedback?.[o.plan.position], o.feedback].filter(Boolean).join("\n") || undefined;
      const res = await chat({
        model: deps.writerModel,
        temperature: 0.6,
        timeoutMs: 180_000,
        messages: sceneMessages({
          plan: o.plan,
          catalog: deps.catalog,
          isFirst: o.plan.position === first,
          isLast: o.plan.position === last,
          feedback,
          previous: o.dsl ? JSON.stringify(o.dsl) : undefined,
        }),
      });
      let raw: unknown;
      try {
        raw = extractJson(res.content);
      } catch (error) {
        return { ...o, dsl: undefined, feedback: `Phản hồi không phải JSON: ${error instanceof Error ? error.message : error}` };
      }
      const parsed = parseSceneDsl(raw);
      // Sai khuôn: giữ dsl cũ để lần sửa sau có bản trước làm cơ sở, kèm danh sách lỗi.
      return parsed.ok
        ? { ...o, dsl: parsed.dsl, feedback: undefined }
        : { ...o, feedback: parsed.issues.slice(0, 15).join("\n") };
    });
    return { scenes: Object.fromEntries(results.map((r) => [r.plan.position, r])) };
  };

  // Node kiểm máy (lớp 1): schema đã qua ở node viết; đây kiểm tham chiếu asset + thoại + tốc độ đọc.
  const check = async (s: typeof State.State) => {
    const updates: Record<number, SceneOutcome> = {};
    for (const o of pending(s)) {
      // Lần viết vừa rồi sai khuôn (`o.feedback` đã mang lỗi zod): coi là trượt lớp 1.
      const issues = o.feedback
        ? o.feedback.split("\n")
        : o.dsl
          ? [...checkSceneDsl(o.dsl, deps.catalog).issues, ...checkDialogue(o.plan, o.dsl.dialogue)]
          : ["JSON cảnh không đúng khuôn"];
      const pass = issues.length === 0;
      // status vẫn `pending`: chưa kết luận cho tới khi giám khảo chấm hoặc hết lượt sửa (node settle).
      updates[o.plan.position] = {
        ...o,
        feedback: pass ? undefined : issues.slice(0, 15).join("\n"),
        history: [...o.history, { round: s.round, stage: "layer1", verdict: pass ? "pass" : "fail", detail: { issues }, feedback: issues.join("\n"), model: "layer1" }],
      };
    }
    return { scenes: updates };
  };

  // Node giám khảo: chỉ chấm cảnh vừa qua lớp 1.
  const judge = async (s: typeof State.State) => {
    const toJudge = pending(s).filter((o) => o.dsl && o.history[o.history.length - 1]?.stage === "layer1" && o.history[o.history.length - 1].verdict === "pass");
    const results = await mapLimit(toJudge, CONCURRENCY, async (o) => {
      const res = await chat({ model: deps.judgeModel, temperature: 0, timeoutMs: 180_000, messages: judgeMessages(o.plan, o.dsl!) });
      let result: JudgeResult | undefined;
      let feedback = "";
      try {
        const parsed = judgeSchema.safeParse(extractJson(res.content));
        if (parsed.success) result = parsed.data;
        else feedback = `Giám khảo trả form sai khuôn: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
      } catch (error) {
        feedback = `Giám khảo không trả JSON: ${error instanceof Error ? error.message : error}`;
      }
      const evaluated = result ? evaluateJudge(result) : { verdict: "fail" as const, average: null, blocked: [] as string[] };
      if (result) {
        feedback = [
          ...evaluated.blocked.map((id) => `BLOCK ${id}: ${result.blocks[id as keyof typeof result.blocks].reason}`),
          result.feedback,
        ].filter(Boolean).join("\n");
      }
      const record: AttemptRecord = { round: s.round, stage: "judge", verdict: evaluated.verdict, detail: { result, ...evaluated }, feedback, model: deps.judgeModel };
      return { ...o, feedback: evaluated.verdict === "pass" ? undefined : feedback, history: [...o.history, record], status: evaluated.verdict } as SceneOutcome;
    });
    return { scenes: Object.fromEntries(results.map((r) => [r.plan.position, r])) };
  };

  // Node chốt vòng: cảnh còn feedback thì vào vòng sửa, hết lượt thì fail. Cảnh qua lớp 1 mà đã judge pass có status "pass".
  const settle = (s: typeof State.State) => {
    const updates: Record<number, SceneOutcome> = {};
    for (const o of pending(s)) {
      const lastJudge = [...o.history].reverse().find((h) => h.stage === "judge");
      const lastCheck = [...o.history].reverse().find((h) => h.stage === "layer1");
      const passed = lastCheck?.verdict === "pass" && lastJudge?.round === s.round && lastJudge.verdict === "pass";
      if (passed) updates[o.plan.position] = { ...o, status: "pass", feedback: undefined };
      else if (s.round >= MAX_REVISIONS) updates[o.plan.position] = { ...o, status: "fail" };
    }
    return { scenes: updates, round: s.round + 1 };
  };

  const route = (s: typeof State.State) => (pending(s).length === 0 ? END : "write");

  return new StateGraph(State)
    .addNode("write", write)
    .addNode("check", check)
    .addNode("judge", judge)
    .addNode("settle", settle)
    .addEdge(START, "write")
    .addEdge("write", "check")
    .addEdge("check", "judge")
    .addEdge("judge", "settle")
    .addConditionalEdges("settle", route, ["write", END])
    .compile({ checkpointer: deps.checkpointer });
}
