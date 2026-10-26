import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmGenerationRuns, algorithmRevisionInputs, algorithmRevisions, algorithmWorkflows } from "@/lib/db/schema";
import type { TokenUsage } from "@/lib/ninerouter/client";
import { resolveWriterModel } from "@/lib/algorithm/model";
import { AlgorithmComboV1Schema, AlgorithmScriptV1Schema, type AlgorithmScriptV1 } from "@/lib/algorithm/contracts";
import { checkScriptRules } from "@/lib/algorithm/script-check";
import { animationMessagesV2 } from "@/lib/algorithm/animation/prompts";
import { loadApprovedVoiceContext, type VoiceContext } from "@/lib/algorithm/voice/context";

import { generateAnimationV2 } from "./animation-llm";
import { describeIssues, generateStructured, LlmContentError } from "./llm-structured";
import { comboMessages, scriptMessages } from "@/lib/algorithm/prompts";
import { validateStagePayload } from "@/lib/algorithm/pipeline";
import { enqueueJobInTransaction, type JobPayload } from "@/lib/queue/jobs";
import { fingerprint } from "@/lib/algorithm/revision";

import { PermanentJobError, type JobContext } from "./job-types";

async function failStage(db: ReturnType<typeof getDb>, revisionId: string, runId: string, error: unknown): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  await db.update(algorithmGenerationRuns).set({ status: "failed", error: message.slice(0, 1000) }).where(eq(algorithmGenerationRuns.id, runId));
  await db.update(algorithmRevisions).set({ status: "failed" }).where(eq(algorithmRevisions.id, revisionId));
  throw new PermanentJobError(message);
}

async function generateStage(payload: JobPayload, ctx: JobContext, stage: "combo" | "script" | "animation") {
  const revisionId = typeof payload.revisionId === "string" ? payload.revisionId : "";
  if (!revisionId) throw new PermanentJobError("Payload thiếu revisionId");
  const db = getDb();
  const [revision] = await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, revisionId)).limit(1);
  if (!revision || revision.stage !== stage || revision.status !== "generating" || !revision.generationRunId) throw new PermanentJobError("Revision stage/status không hợp lệ");
  const [generationRun] = await db.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.id, revision.generationRunId)).limit(1);
  if (!generationRun) throw new PermanentJobError("Không có generation run cho revision");
  let model: string;
  try { model = resolveWriterModel(generationRun.inputSnapshot); }
  catch (error) { return failStage(db, revision.id, generationRun.id, error); }
  await db.update(algorithmGenerationRuns).set({ status: "running", model, promptVersion: `algorithm-${stage}-v1` }).where(eq(algorithmGenerationRuns.id, generationRun.id));
  const [workflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, revision.videoId)).limit(1);
  const activeId = stage === "combo" ? workflow?.activeComboId : stage === "script" ? workflow?.activeScriptId : workflow?.activeAnimationId;
  const acceptedInputId = stage === "combo" ? workflow?.acceptedSolutionId : stage === "script" ? workflow?.acceptedComboId : workflow?.acceptedVoiceId;
  if (!workflow || activeId !== revision.id || acceptedInputId !== (await db.select({ inputRevisionId: algorithmRevisionInputs.inputRevisionId }).from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id)).limit(1))[0]?.inputRevisionId) {
    await db.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
    await db.update(algorithmGenerationRuns).set({ status: "stale" }).where(eq(algorithmGenerationRuns.id, generationRun.id));
    return { stale: true };
  }
  const inputs = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id));
  if (inputs.length !== 1) return failStage(db, revision.id, generationRun.id, "Revision cần đúng một input đã duyệt");
  const [input] = await db.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, inputs[0].inputRevisionId), eq(algorithmRevisions.status, "approved"))).limit(1);
  if (!input) return failStage(db, revision.id, generationRun.id, "Input revision chưa được duyệt");
  const inputContent = input.content;
  let voiceContext: VoiceContext | undefined;
  let messages;
  if (stage === "combo") {
    const [problemInput] = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, input.id)).limit(1);
    const [problem] = problemInput ? await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, problemInput.inputRevisionId)).limit(1) : [];
    if (!problem || problem.status !== "approved") return failStage(db, revision.id, generationRun.id, "Không có đề đã duyệt cho lời giải");
    messages = comboMessages(problem.content, inputContent);
  } else if (stage === "script") {
    const [comboInput] = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, input.id)).limit(1);
    const [solution] = comboInput ? await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, comboInput.inputRevisionId)).limit(1) : [];
    const [solutionInput] = solution ? await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, solution.id)).limit(1) : [];
    const [problem] = solutionInput ? await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, solutionInput.inputRevisionId)).limit(1) : [];
    if (!solution || solution.status !== "approved" || !problem || problem.status !== "approved") return failStage(db, revision.id, generationRun.id, "Thiếu đề hoặc lời giải đã duyệt");
    messages = scriptMessages(problem.content, solution.content, inputContent);
  } else {
    try { voiceContext = await loadApprovedVoiceContext(db, revision.videoId); }
    catch (error) { return failStage(db, revision.id, generationRun.id, error); }
    if (voiceContext.voice.id !== input.id) return failStage(db, revision.id, generationRun.id, "Voice đầu vào không còn là bản đã duyệt hiện hành");
    const [comboInput] = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, voiceContext.script.id)).limit(1);
    const [solutionInput] = comboInput ? await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, comboInput.inputRevisionId)).limit(1) : [];
    const [solution] = solutionInput ? await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, solutionInput.inputRevisionId)).limit(1) : [];
    if (!solution || solution.status !== "approved" || solution.id !== workflow.acceptedSolutionId || !comboInput || comboInput.inputRevisionId !== workflow.acceptedComboId) return failStage(db, revision.id, generationRun.id, "Script không còn liên kết với combo và lời giải hiện hành");
    const [requests] = await db.select({ n: sql<number>`count(*)::int` }).from(algorithmAssetRequests)
      .where(and(eq(algorithmAssetRequests.scriptRevisionId, voiceContext.script.id), eq(algorithmAssetRequests.status, "bound")));
    const [totalRequests] = await db.select({ n: sql<number>`count(*)::int` }).from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, voiceContext.script.id));
    if ((totalRequests?.n ?? 0) !== (requests?.n ?? 0)) return failStage(db, revision.id, generationRun.id, "Script có asset request chưa binding");
    messages = animationMessagesV2({ script: voiceContext.scriptContent, solution: solution.content, voice: voiceContext.voiceContent, timeline: voiceContext.timeline });
  }
  let content: unknown;
  let generatedModel: string;
  let generatedUsage: TokenUsage;
  try {
    model = resolveWriterModel(generationRun.inputSnapshot);
    let repairRounds = 0;
    let warnings: string[] = [];
    if (stage === "animation" && voiceContext) {
      const generated = await generateAnimationV2({ model, messages: messages!, timeline: voiceContext.timeline, ctx });
      content = generated.content; generatedModel = generated.model; generatedUsage = generated.usage; repairRounds = generated.repairRounds; warnings = generated.warnings;
    } else {
      const schema = stage === "combo" ? AlgorithmComboV1Schema : AlgorithmScriptV1Schema;
      const generated = await generateStructured({
        label: `LLM ${stage}`, model, messages: messages!, ctx, temperature: stage === "combo" ? 0.4 : 0.2,
        parse: async (raw) => {
          const parsed = schema.safeParse(raw);
          if (!parsed.success) return { ok: false, problems: describeIssues(parsed.error) };
          try {
            const data = await validateStagePayload(stage as "combo" | "script", parsed.data);
            const problems = stage === "script" ? checkScriptRules(data as AlgorithmScriptV1) : [];
            return problems.length ? { ok: false, problems } : { ok: true, data };
          } catch (error) { return { ok: false, problems: [error instanceof Error ? error.message : String(error)] }; }
        },
      });
      content = generated.data; generatedModel = generated.model; generatedUsage = generated.usage; repairRounds = generated.repairRounds;
    }
    await db.update(algorithmGenerationRuns).set({ model: generatedModel, metrics: { usage: generatedUsage, repairRounds, warnings } }).where(eq(algorithmGenerationRuns.id, generationRun.id));
  } catch (error) {
    const permanent = error instanceof LlmContentError;
    const message = error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
    if (permanent || ctx.attempt >= 3) {
      await db.update(algorithmGenerationRuns).set({ status: "failed", error: message }).where(eq(algorithmGenerationRuns.id, generationRun.id));
      await db.update(algorithmRevisions).set({ status: "failed" }).where(eq(algorithmRevisions.id, revision.id));
    }
    if (permanent) throw new PermanentJobError(message);
    throw error;
  }
  const [latestWorkflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, revision.videoId)).limit(1);
  const latestActive = stage === "combo" ? latestWorkflow?.activeComboId : stage === "script" ? latestWorkflow?.activeScriptId : latestWorkflow?.activeAnimationId;
  const latestAcceptedInput = stage === "combo" ? latestWorkflow?.acceptedSolutionId : stage === "script" ? latestWorkflow?.acceptedComboId : latestWorkflow?.acceptedVoiceId;
  if (latestActive !== revision.id || latestAcceptedInput !== input.id) {
    await db.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
    await db.update(algorithmGenerationRuns).set({ status: "stale" }).where(eq(algorithmGenerationRuns.id, generationRun.id));
    return { stale: true, model: generatedModel, usage: generatedUsage };
  }
  await db.transaction(async (tx) => {
    if (stage === "script") {
      const script = content as { scenes: { assetKeys: string[]; visual: string }[] };
      const assetKeys = [...new Set(script.scenes.flatMap((scene) => scene.assetKeys))];
      for (const [key, brief] of new Map(assetKeys.map((assetKey) => [assetKey, script.scenes.find((scene) => scene.assetKeys.includes(assetKey))?.visual ?? ""] as const))) {
        await tx.insert(algorithmAssetRequests).values({ videoId: revision.videoId, scriptRevisionId: revision.id, temporaryKey: key, brief }).onConflictDoNothing();
      }
      // Gán asset là việc của hệ thống: người dùng chỉ duyệt ảnh mới.
      if (assetKeys.length) await enqueueJobInTransaction(tx, "algorithm.assets.resolve", { videoId: revision.videoId, scriptRevisionId: revision.id, model }, { type: "algorithm_workflow", id: revision.videoId });
    }
    await tx.update(algorithmRevisions).set({ content, status: "pending_review", model: generatedModel, inputFingerprint: fingerprint({ input: input.inputFingerprint, content }) })
      .where(and(eq(algorithmRevisions.id, revision.id), eq(algorithmRevisions.status, "generating")));
    await tx.update(algorithmGenerationRuns).set({ status: "waiting_review" }).where(eq(algorithmGenerationRuns.id, generationRun.id));
  });
  return { model: generatedModel, usage: generatedUsage, pendingReview: true };
}

export const proposeAlgorithmCombo = (payload: JobPayload, ctx: JobContext) => generateStage(payload, ctx, "combo");
export const generateAlgorithmScript = (payload: JobPayload, ctx: JobContext) => generateStage(payload, ctx, "script");
export const generateAlgorithmAnimation = (payload: JobPayload, ctx: JobContext) => generateStage(payload, ctx, "animation");
