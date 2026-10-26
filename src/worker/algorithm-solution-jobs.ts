import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmGenerationRuns, algorithmRevisionInputs, algorithmRevisions, algorithmWorkflows } from "@/lib/db/schema";
import type { TokenUsage } from "@/lib/ninerouter/client";
import { resolveWriterModel } from "@/lib/algorithm/model";
import type { JobPayload } from "@/lib/queue/jobs";
import { AlgorithmSolutionV2Schema, type AlgorithmSolutionV2 } from "@/lib/algorithm/contracts";
import { checkSolutionV2, normalizeSolutionV2 } from "@/lib/algorithm/solution-check";
import { fingerprint } from "@/lib/algorithm/revision";
import { algorithmSolutionMessages } from "@/lib/algorithm/solution-prompts";

import { PermanentJobError, type JobContext } from "./job-types";
import { describeIssues, generateStructured, LlmContentError } from "./llm-structured";

async function markFailed(db: ReturnType<typeof getDb>, runId: string, revisionId: string, message: string) {
  await db.update(algorithmGenerationRuns).set({ status: "failed", error: message.slice(0, 1000) }).where(eq(algorithmGenerationRuns.id, runId));
  await db.update(algorithmRevisions).set({ status: "failed" }).where(eq(algorithmRevisions.id, revisionId));
}

export async function generateAlgorithmSolution(payload: JobPayload, ctx: JobContext) {
  const generationRunId = typeof payload.generationRunId === "string" ? payload.generationRunId : "";
  const revisionId = typeof payload.revisionId === "string" ? payload.revisionId : "";
  if (!generationRunId || !revisionId) throw new PermanentJobError("Payload thiếu generationRunId hoặc revisionId");
  const db = getDb();
  const [run] = await db.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.id, generationRunId)).limit(1);
  const [revision] = await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, revisionId)).limit(1);
  if (!run || !revision || run.stage !== "solution" || revision.stage !== "solution" || revision.generationRunId !== run.id || revision.videoId !== run.videoId) {
    throw new PermanentJobError("Generation run hoặc revision không hợp lệ");
  }
  if (run.status === "succeeded" && revision.status === "pending_review") return { alreadyDone: true };
  const [workflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
  if (!workflow || workflow.activeSolutionId !== revision.id) {
    await db.update(algorithmGenerationRuns).set({ status: "stale" }).where(eq(algorithmGenerationRuns.id, run.id));
    await db.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
    return { stale: true };
  }
  const snapshot = run.inputSnapshot as { problemRevisionId?: string; problem?: unknown; problemFingerprint?: string; seriesId?: string; feedback?: string };
  if (typeof snapshot.problemRevisionId !== "string" || typeof snapshot.problemFingerprint !== "string" || typeof snapshot.seriesId !== "string") {
    throw new PermanentJobError("Generation snapshot thiếu đề bài hoặc fingerprint");
  }
  const problem = snapshot.problem as { text?: unknown; story?: unknown; modeling?: unknown } | undefined;
  const problemInput = {
    text: typeof problem?.text === "string" ? problem.text : "",
    story: typeof problem?.story === "string" ? problem.story : undefined,
    modeling: typeof problem?.modeling === "string" ? problem.modeling : undefined,
  };
  let model: string;
  try {
    model = resolveWriterModel(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(db, run.id, revision.id, message);
    throw new PermanentJobError(message);
  }
  await db.update(algorithmGenerationRuns).set({ status: "running", model, promptVersion: "algorithm-solution-v2" }).where(eq(algorithmGenerationRuns.id, run.id));
  await ctx.extendLock(240);
  let res: { model: string; usage: TokenUsage };
  let parsedData: AlgorithmSolutionV2;
  try {
    const generated = await generateStructured<AlgorithmSolutionV2>({
      label: "Lời giải LLM", model, messages: algorithmSolutionMessages(problemInput, typeof snapshot.feedback === "string" ? snapshot.feedback : undefined), ctx, temperature: 0.3, timeoutMs: 240_000,
      parse: (raw) => {
        const parsed = AlgorithmSolutionV2Schema.safeParse(raw);
        if (!parsed.success) return { ok: false, problems: describeIssues(parsed.error) };
        const data = normalizeSolutionV2(parsed.data);
        const problems = checkSolutionV2(data);
        return problems.length ? { ok: false, problems } : { ok: true, data };
      },
    });
    res = { model: generated.model, usage: generated.usage };
    parsedData = generated.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Lỗi nội dung (sửa máy không thành công) là vĩnh viễn; lỗi mạng/router để runner thử lại, hết lượt mới đánh dấu thất bại.
    if (error instanceof LlmContentError) {
      await markFailed(db, run.id, revision.id, message);
      throw new PermanentJobError(message);
    }
    if (ctx.attempt >= 3) await markFailed(db, run.id, revision.id, message);
    throw error;
  }

  const inputFingerprint = fingerprint({ problemFingerprint: snapshot.problemFingerprint, problemRevisionId: snapshot.problemRevisionId, content: parsedData });
  const [freshWorkflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
  const [freshInput] = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id)).limit(1);
  if (!freshWorkflow || freshWorkflow.activeSolutionId !== revision.id || freshWorkflow.acceptedProblemId !== snapshot.problemRevisionId || freshInput?.inputRevisionId !== snapshot.problemRevisionId) {
    await db.update(algorithmGenerationRuns).set({ status: "stale", metrics: { model: res.model, usage: res.usage } }).where(eq(algorithmGenerationRuns.id, run.id));
    await db.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
    return { stale: true, model: res.model, usage: res.usage };
  }
  await db.transaction(async (tx) => {
    const [currentRun] = await tx.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.id, run.id)).limit(1);
    const [currentWorkflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
    const [currentInput] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id)).limit(1);
    if (!currentRun || currentRun.status !== "running" || !currentWorkflow || currentWorkflow.activeSolutionId !== revision.id || currentWorkflow.acceptedProblemId !== snapshot.problemRevisionId || currentInput?.inputRevisionId !== snapshot.problemRevisionId) {
      await tx.update(algorithmGenerationRuns).set({ status: "stale", metrics: { model: res.model, usage: res.usage } }).where(eq(algorithmGenerationRuns.id, run.id));
      await tx.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
      return;
    }
    const [updatedRevision] = await tx.update(algorithmRevisions).set({ content: parsedData, status: "pending_review", model: res.model, inputFingerprint })
      .where(and(eq(algorithmRevisions.id, revision.id), inArray(algorithmRevisions.status, ["generating", "failed"]))).returning({ id: algorithmRevisions.id });
    if (!updatedRevision) throw new Error("Solution revision changed before publishing result");
    await tx.update(algorithmGenerationRuns).set({ status: "succeeded", error: null, model: res.model, metrics: { usage: res.usage } }).where(eq(algorithmGenerationRuns.id, run.id));
  });
  return { model: res.model, usage: res.usage, pendingReview: true };
}
