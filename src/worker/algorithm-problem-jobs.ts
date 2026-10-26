import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmGenerationRuns, algorithmRevisions, algorithmWorkflows } from "@/lib/db/schema";
import { AlgorithmProblemV2Schema, type AlgorithmProblemV2 } from "@/lib/algorithm/contracts";
import { resolveWriterModel } from "@/lib/algorithm/model";
import { checkProblemV2, normalizeProblemV2 } from "@/lib/algorithm/problem-check";
import { problemMessages } from "@/lib/algorithm/problem-prompts";
import { fingerprint } from "@/lib/algorithm/revision";
import type { JobPayload } from "@/lib/queue/jobs";

import { PermanentJobError, type JobContext } from "./job-types";
import { describeIssues, generateStructured, LlmContentError } from "./llm-structured";

async function markFailed(db: ReturnType<typeof getDb>, runId: string, revisionId: string, message: string) {
  await db.update(algorithmGenerationRuns).set({ status: "failed", error: message.slice(0, 1000) }).where(eq(algorithmGenerationRuns.id, runId));
  await db.update(algorithmRevisions).set({ status: "failed" }).where(eq(algorithmRevisions.id, revisionId));
}

// Bước 1: từ chủ đề người dùng nhập, LLM viết truyện ngắn, mô hình hoá và ra đề (AlgorithmProblemV2) để người dùng duyệt.
export async function generateAlgorithmProblem(payload: JobPayload, ctx: JobContext) {
  const generationRunId = typeof payload.generationRunId === "string" ? payload.generationRunId : "";
  const revisionId = typeof payload.revisionId === "string" ? payload.revisionId : "";
  if (!generationRunId || !revisionId) throw new PermanentJobError("Payload thiếu generationRunId hoặc revisionId");
  const db = getDb();
  const [run] = await db.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.id, generationRunId)).limit(1);
  const [revision] = await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, revisionId)).limit(1);
  if (!run || !revision || run.stage !== "problem" || revision.stage !== "problem" || revision.generationRunId !== run.id || revision.videoId !== run.videoId) {
    throw new PermanentJobError("Generation run hoặc revision không hợp lệ");
  }
  if (run.status === "succeeded" && revision.status === "pending_review") return { alreadyDone: true };
  const [workflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
  if (!workflow || workflow.activeProblemId !== revision.id) {
    await db.update(algorithmGenerationRuns).set({ status: "stale" }).where(eq(algorithmGenerationRuns.id, run.id));
    await db.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
    return { stale: true };
  }
  const snapshot = run.inputSnapshot as { theme?: unknown; topic?: unknown; seriesId?: unknown; model?: unknown };
  const theme = typeof snapshot.theme === "string" ? snapshot.theme : "";
  const topic = typeof snapshot.topic === "string" ? snapshot.topic : "";
  if (!theme || typeof snapshot.seriesId !== "string") throw new PermanentJobError("Generation snapshot thiếu chủ đề hoặc series");
  let model: string;
  try {
    model = resolveWriterModel(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markFailed(db, run.id, revision.id, message);
    throw new PermanentJobError(message);
  }
  await db.update(algorithmGenerationRuns).set({ status: "running", model, promptVersion: "algorithm-problem-v2" }).where(eq(algorithmGenerationRuns.id, run.id));
  await ctx.extendLock(240);

  let generated: Awaited<ReturnType<typeof generateStructured<AlgorithmProblemV2>>>;
  try {
    generated = await generateStructured<AlgorithmProblemV2>({
      label: "Truyện và đề bài LLM", model, messages: problemMessages({ theme, topic }), ctx, temperature: 0.7, timeoutMs: 240_000,
      parse: (raw) => {
        const parsed = AlgorithmProblemV2Schema.safeParse(raw);
        if (!parsed.success) return { ok: false, problems: describeIssues(parsed.error) };
        // Chủ đề và dạng thuật toán lấy từ người dùng, không lấy theo LLM.
        const data = normalizeProblemV2({ ...parsed.data, theme });
        if (topic) data.topic = topic; else delete data.topic;
        const problems = checkProblemV2(data);
        return problems.length ? { ok: false, problems } : { ok: true, data };
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof LlmContentError) {
      await markFailed(db, run.id, revision.id, message);
      throw new PermanentJobError(message);
    }
    if (ctx.attempt >= 3) await markFailed(db, run.id, revision.id, message);
    throw error;
  }

  const problem = generated.data;
  const inputFingerprint = fingerprint({ seriesId: snapshot.seriesId, content: problem });
  await db.transaction(async (tx) => {
    const [currentRun] = await tx.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.id, run.id)).limit(1);
    const [currentWorkflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
    if (!currentRun || currentRun.status !== "running" || !currentWorkflow || currentWorkflow.activeProblemId !== revision.id) {
      await tx.update(algorithmGenerationRuns).set({ status: "stale", metrics: { model: generated.model, usage: generated.usage } }).where(eq(algorithmGenerationRuns.id, run.id));
      await tx.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
      return;
    }
    const [updated] = await tx.update(algorithmRevisions).set({ content: problem, status: "pending_review", model: generated.model, inputFingerprint })
      .where(and(eq(algorithmRevisions.id, revision.id), inArray(algorithmRevisions.status, ["generating", "failed"]))).returning({ id: algorithmRevisions.id });
    if (!updated) throw new Error("Problem revision changed before publishing result");
    await tx.update(algorithmGenerationRuns).set({ status: "succeeded", error: null, model: generated.model, metrics: { usage: generated.usage, repairRounds: generated.repairRounds } }).where(eq(algorithmGenerationRuns.id, run.id));
  });
  return { model: generated.model, usage: generated.usage, pendingReview: true };
}
