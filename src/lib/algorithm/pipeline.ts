import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmDecisions, algorithmGenerationRuns, algorithmOutputs, algorithmRevisionInputs, algorithmRevisions, algorithmVoiceClips, algorithmWorkflows, assetVariants, assets, videos } from "@/lib/db/schema";
import { enqueueJob, enqueueJobInTransaction } from "@/lib/queue/jobs";
import type { JobPayload } from "@/lib/queue/jobs";

import { checkAnimation } from "./animation/check";
import { AlgorithmAnimationSchema, AlgorithmAnimationV2Schema, type AlgorithmAnimationV2 } from "./animation/schema";
import { AlgorithmComboV1Schema, AlgorithmScriptV1Schema, type AlgorithmComboV1, type AlgorithmScriptV1 } from "./contracts";
import { checkScriptRules } from "./script-check";
import { checkVoiceAgainstScript } from "./voice/checks";
import { clipFingerprint, deliveryOf } from "./voice/clips";
import { MAX_VIDEO_FRAMES } from "./voice/constants";
import { AlgorithmVoiceV1Schema, sceneSpeed } from "./voice/contract";
import { loadApprovedVoiceContext } from "./voice/context";
import { buildVoiceTimeline } from "./voice/timeline";

export type AlgorithmStage = "problem" | "solution" | "combo" | "script" | "assets" | "voice" | "animation" | "render" | "done";
type RevisionContent = AlgorithmComboV1 | AlgorithmScriptV1 | AlgorithmAnimationV2;

const stagePointers: Record<"combo" | "script" | "assets" | "voice" | "animation", { active: "activeComboId" | "activeScriptId" | "activeAssetsId" | "activeVoiceId" | "activeAnimationId"; accepted: "acceptedComboId" | "acceptedScriptId" | "acceptedAssetsId" | "acceptedVoiceId" | "acceptedAnimationId" }> = {
  combo: { active: "activeComboId", accepted: "acceptedComboId" },
  script: { active: "activeScriptId", accepted: "acceptedScriptId" },
  assets: { active: "activeAssetsId", accepted: "acceptedAssetsId" },
  voice: { active: "activeVoiceId", accepted: "acceptedVoiceId" },
  animation: { active: "activeAnimationId", accepted: "acceptedAnimationId" },
};

const schemas = {
  combo: AlgorithmComboV1Schema,
  script: AlgorithmScriptV1Schema,
  animation: AlgorithmAnimationV2Schema,
} as const;

const ALGORITHM_RENDERER_VERSION = "4.0.537";

export const ALGORITHM_STAGE_JOBS = {
  combo: "algorithm.combo.propose",
  script: "algorithm.script.generate",
  voice: "algorithm.voice.generate",
  animation: "algorithm.animation.generate",
  render: "algorithm.video.render",
} as const;

export function stageFingerprint(stage: string, content: unknown): string {
  return createHash("sha256").update(JSON.stringify({ stage, content })).digest("hex");
}

export type VoiceOptions = { voice: string; defaultSpeed: number; scenes: { sceneId: string; speed: number }[] };

export async function prepareStageRevision(videoId: string, stage: "combo" | "script" | "voice" | "animation", expectedConcurrencyVersion: number, options?: VoiceOptions, model?: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi tiếp tục");
    const [joined] = await tx.select({ video: videos, workflow: algorithmWorkflows }).from(videos)
      .innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    if (!joined) throw new Error("Không có workflow thuật toán");
    const input = stage === "combo" ? joined.workflow.acceptedSolutionId
      : stage === "script" ? joined.workflow.acceptedComboId
      : stage === "voice" ? joined.workflow.acceptedScriptId
      : joined.workflow.acceptedVoiceId;
    if (!input) throw new Error(`Cần duyệt bước trước khi bắt đầu ${stage}`);
    const [inputRevision] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.id, input), eq(algorithmRevisions.videoId, videoId))).limit(1);
    if (!inputRevision || inputRevision.status !== "approved") throw new Error("Revision đầu vào chưa được duyệt");
    if (stage === "script") {
      const [solutionInput] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, inputRevision.id)).limit(1);
      if (!solutionInput) throw new Error("Thiếu lời giải nguồn cho combo đã duyệt");
      const [solution] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, solutionInput.inputRevisionId), eq(algorithmRevisions.videoId, videoId))).limit(1);
      if (!solution || solution.stage !== "solution" || solution.status !== "approved" || solution.id !== joined.workflow.acceptedSolutionId) throw new Error("Combo không còn dựa trên lời giải hiện đang được duyệt");
    }
    if (stage === "voice") {
      const [comboInput] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, inputRevision.id)).limit(1);
      const [solutionInput] = comboInput ? await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, comboInput.inputRevisionId)).limit(1) : [];
      if (inputRevision.id !== joined.workflow.acceptedScriptId || !comboInput || comboInput.inputRevisionId !== joined.workflow.acceptedComboId || !solutionInput || solutionInput.inputRevisionId !== joined.workflow.acceptedSolutionId) throw new Error("Script không còn dựa trên combo/lời giải hiện hành");
      const requests = await tx.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, inputRevision.id));
      if (requests.some((request) => request.status !== "bound" || !request.assetId || !request.state)) throw new Error("Script có asset request chưa binding");
      if (!options) throw new Error("Thiếu tùy chọn giọng và tốc độ");
    }
    if (stage === "animation") {
      const voiceContext = await loadApprovedVoiceContext(tx, videoId);
      if (voiceContext.voice.id !== inputRevision.id) throw new Error("Voice đã duyệt không còn là đầu vào hiện hành");
      const requests = await tx.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, voiceContext.script.id));
      if (requests.some((request) => request.status !== "bound" || !request.assetId || !request.state)) throw new Error("Script có asset request chưa binding");
    }
    if ((stage === "script" || stage === "voice") && joined.workflow[stagePointers[stage].active]) {
      const [activeRevision] = await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, joined.workflow[stagePointers[stage].active]!)).limit(1);
      if (activeRevision?.status === "generating") throw new Error(stage === "script" ? "Kịch bản đang được worker sinh; không thể tạo yêu cầu trùng" : "Voice đang được worker sinh; không thể tạo yêu cầu trùng");
    }
    const [latest] = await tx.select({ version: algorithmRevisions.version }).from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, stage))).orderBy(desc(algorithmRevisions.version)).limit(1);
    const revisionId = randomUUID();
    const content = {};
    const inputFingerprint = stageFingerprint(stage, { inputRevisionId: inputRevision.id, inputFingerprint: inputRevision.inputFingerprint, options: options ?? null, ...(model ? { model } : {}) });
    const requestKey = randomUUID();
    const [generationRun] = await tx.insert(algorithmGenerationRuns).values({
      videoId, stage, threadId: `algorithm-${stage}:${videoId}:${requestKey}`, requestKey,
      inputSnapshot: { inputRevisionId: inputRevision.id, inputFingerprint: inputRevision.inputFingerprint, options: options ?? null, ...(model ? { model } : {}) },
      inputFingerprint, status: "queued", contractVersion: 1,
    }).returning({ id: algorithmGenerationRuns.id });
    const [revision] = await tx.insert(algorithmRevisions).values({ videoId, id: revisionId, stage, version: (latest?.version ?? 0) + 1, content, source: "llm", status: "generating", generationRunId: generationRun.id, inputFingerprint }).returning();
    await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId, inputRevisionId: inputRevision.id });
    const pointers = stagePointers[stage];
    const clears = stage === "combo" ? { activeScriptId: null, acceptedScriptId: null, activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null, activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null }
      : stage === "script" ? { activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null, activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null }
      : stage === "voice" ? { activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null }
      : { activeOutputId: null, acceptedOutputId: null };
    const supersededId = joined.workflow[pointers.active];
    if (supersededId) {
      const [superseded] = await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, supersededId)).limit(1);
      if (superseded?.status === "generating") {
        await tx.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, superseded.id));
        if (superseded.generationRunId) await tx.update(algorithmGenerationRuns).set({ status: "stale" }).where(eq(algorithmGenerationRuns.id, superseded.generationRunId));
      } else if (superseded?.status === "pending_review") {
        await tx.insert(algorithmDecisions).values({ videoId, revisionId: superseded.id, decision: "rejected", reason: `Thay bằng revision ${stage} mới`, expectedFingerprint: superseded.inputFingerprint });
        await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, superseded.id));
      }
    }
    await tx.update(algorithmWorkflows).set({ ...clears, [pointers.active]: revision.id, [pointers.accepted]: null, stage, concurrencyVersion: expectedConcurrencyVersion + 1 }).where(eq(algorithmWorkflows.videoId, videoId));
    const type = ALGORITHM_STAGE_JOBS[stage];
    const jobRunId = await enqueueJobInTransaction(tx, type, { revisionId: revision.id }, { type: "algorithm_workflow", id: videoId });
    await tx.update(algorithmGenerationRuns).set({ jobRunId }).where(eq(algorithmGenerationRuns.id, generationRun.id));
    return { revision, jobRunId };
  });
}

export async function prepareManualCombo(videoId: string, content: AlgorithmComboV1, expectedConcurrencyVersion: number, reason: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi tiếp tục");
    const [workflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
    if (!workflow?.acceptedSolutionId) throw new Error("Cần duyệt lời giải trước khi chọn combo");
    const [solution] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.id, workflow.acceptedSolutionId), eq(algorithmRevisions.videoId, videoId))).limit(1);
    if (!solution || solution.status !== "approved") throw new Error("Lời giải đã duyệt không còn hợp lệ");
    const [active] = workflow.activeComboId
      ? await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, workflow.activeComboId)).limit(1)
      : [];
    if (active?.status === "generating") throw new Error("Đề xuất combo đang chạy; chờ worker hoàn tất trước khi chọn tay");
    if (active?.status === "pending_review") {
      if (reason.trim().length < 5) throw new Error("Cần lý do từ chối combo đề xuất ít nhất 5 ký tự");
      await tx.insert(algorithmDecisions).values({ videoId, revisionId: active.id, decision: "rejected", reason: reason.trim(), expectedFingerprint: active.inputFingerprint });
      await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, active.id));
    }
    const [latest] = await tx.select({ version: algorithmRevisions.version }).from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "combo"))).orderBy(desc(algorithmRevisions.version)).limit(1);
    const revisionId = randomUUID();
    const inputFingerprint = stageFingerprint("combo", { inputRevisionId: solution.id, inputFingerprint: solution.inputFingerprint, content });
    const [revision] = await tx.insert(algorithmRevisions).values({
      videoId, id: revisionId, stage: "combo", version: (latest?.version ?? 0) + 1, content,
      source: "human", status: "pending_review", inputFingerprint,
    }).returning();
    await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId, inputRevisionId: solution.id });
    await tx.update(algorithmWorkflows).set({
      activeComboId: revision.id, acceptedComboId: null,
      activeScriptId: null, acceptedScriptId: null, activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null,
      activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null,
      stage: "combo", concurrencyVersion: expectedConcurrencyVersion + 1,
    }).where(eq(algorithmWorkflows.videoId, videoId));
    return revision;
  });
}

export async function approveAlgorithmStage(videoId: string, revisionId: string, stage: "combo" | "script" | "voice" | "animation", expectedFingerprint: string, expectedConcurrencyVersion: number) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã đổi; tải lại trước khi duyệt");
    const [workflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
    const [revision] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.id, revisionId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, stage))).limit(1);
    const pointers = stagePointers[stage];
    if (!workflow || workflow[pointers.active] !== revisionId || !revision || revision.status !== "pending_review") throw new Error("Revision không còn là bản hiện hành chờ duyệt");
    if (revision.inputFingerprint !== expectedFingerprint) throw new Error("Fingerprint không khớp");
    const [input] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revisionId)).limit(1);
    if (!input) throw new Error("Thiếu revision đầu vào");
    const [acceptedInput] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, input.inputRevisionId), eq(algorithmRevisions.status, "approved"))).limit(1);
    if (!acceptedInput) throw new Error("Revision đầu vào chưa được duyệt");
    if (stage === "combo") {
      const parsedCombo = AlgorithmComboV1Schema.safeParse(revision.content);
      if (!parsedCombo.success || parsedCombo.data.outline.reduce((total, item) => total + item.seconds, 0) !== parsedCombo.data.targetSeconds) {
        throw new Error("Combo không hợp lệ hoặc tổng thời lượng outline không khớp");
      }
      const [solutionInput] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revisionId)).limit(1);
      if (!solutionInput || solutionInput.inputRevisionId !== workflow.acceptedSolutionId) throw new Error("Combo không còn dựa trên lời giải hiện đang được duyệt");
    }
    if (stage === "voice") {
      const [script] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, input.inputRevisionId), eq(algorithmRevisions.status, "approved"))).limit(1);
      const [comboInput] = script ? await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, script.id)).limit(1) : [];
      const [solutionInput] = comboInput ? await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, comboInput.inputRevisionId)).limit(1) : [];
      if (!script || script.id !== workflow.acceptedScriptId || !comboInput || comboInput.inputRevisionId !== workflow.acceptedComboId || !solutionInput || solutionInput.inputRevisionId !== workflow.acceptedSolutionId) throw new Error("Voice không còn dựa trên kịch bản/combo/lời giải hiện hành");
      const voice = AlgorithmVoiceV1Schema.safeParse(revision.content);
      const scriptContent = AlgorithmScriptV1Schema.safeParse(script.content);
      if (!voice.success || !scriptContent.success) throw new Error("Voice hoặc kịch bản sai schema");
      const blocking = checkVoiceAgainstScript(voice.data, scriptContent.data);
      if (blocking.length) throw new Error(`Voice còn lỗi: ${blocking[0].message}`);
      const clips = await tx.select().from(algorithmVoiceClips).where(eq(algorithmVoiceClips.voiceRevisionId, revisionId));
      for (const cue of voice.data.cues) {
        const clip = clips.find((item) => item.cueId === cue.id);
        const expected = clipFingerprint({ spokenText: cue.spokenText, voice: voice.data.voice, speed: sceneSpeed(voice.data, cue.sceneId), delivery: deliveryOf(scriptContent.data, cue.sceneId) });
        if (!clip || clip.status !== "ready" || !clip.durationMs || clip.fingerprint !== expected) throw new Error(`Clip ${cue.id} chưa sẵn sàng; sinh lại voice trước khi duyệt`);
      }
      const timeline = buildVoiceTimeline(scriptContent.data, voice.data, clips.map((clip) => ({ cueId: clip.cueId, durationMs: clip.durationMs! })));
      if (timeline.totalFrames > MAX_VIDEO_FRAMES) throw new Error(`Tổng thời lượng audio ${timeline.totalFrames} frame vượt giới hạn ${MAX_VIDEO_FRAMES}; rút gọn kịch bản hoặc tăng tốc trong khoảng cho phép`);
    }
    if (stage === "animation") {
      const voiceContext = await loadApprovedVoiceContext(tx, videoId);
      if (voiceContext.voice.id !== input.inputRevisionId) throw new Error("Animation không còn dựa trên voice hiện hành");
      const script = voiceContext.script;
      const scriptContent = { success: true as const, data: voiceContext.scriptContent };
      const animation = AlgorithmAnimationSchema.safeParse(revision.content);
      if (!animation.success) throw new Error("Animation sai schema");
      const animationCheck = checkAnimation(animation.data, voiceContext.timeline);
      if (animationCheck.errors.length) throw new Error(`Animation không hợp lệ: ${animationCheck.errors[0]}`);
      const requests = await tx.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, script.id));
      const usedKeys = [...new Set(scriptContent.data.scenes.flatMap((scene) => scene.assetKeys))];
      if (requests.length !== usedKeys.length || requests.some((request) => request.status !== "bound" || !request.assetId || !request.state)) throw new Error("Asset manifest của script còn request chưa binding");
      const [video] = await tx.select({ seriesId: videos.seriesId }).from(videos).where(eq(videos.id, videoId)).limit(1);
      for (const request of requests) {
        const [binding] = await tx.select({ assetId: assets.id }).from(assets).innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
          .where(and(eq(assets.id, request.assetId!), eq(assets.seriesId, video?.seriesId ?? ""), eq(assets.status, "approved"), eq(assetVariants.state, request.state!), eq(assetVariants.status, "approved"))).limit(1);
        if (!binding) throw new Error("Animation tham chiếu asset không còn được duyệt hoặc sai series");
      }
    }
    if (stage === "script") {
      const [video] = await tx.select({ seriesId: videos.seriesId }).from(videos).where(eq(videos.id, videoId)).limit(1);
      const [comboInput] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revisionId)).limit(1);
      const [solutionInput] = comboInput ? await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, comboInput.inputRevisionId)).limit(1) : [];
      if (!comboInput || comboInput.inputRevisionId !== workflow.acceptedComboId || !solutionInput || solutionInput.inputRevisionId !== workflow.acceptedSolutionId || !video) throw new Error("Script không còn dựa trên combo/lời giải/series hiện hành");
      const parsedScript = AlgorithmScriptV1Schema.safeParse(revision.content);
      if (!parsedScript.success) throw new Error("Kịch bản sai schema");
      const scriptRuleProblems = checkScriptRules(parsedScript.data);
      if (scriptRuleProblems.length) throw new Error(`Kịch bản chưa đạt luật: ${scriptRuleProblems[0]}`);
      if (parsedScript.data.scenes.reduce((total, scene) => total + scene.seconds, 0) !== parsedScript.data.targetSeconds) {
        throw new Error("Tổng thời lượng các cảnh phải bằng thời lượng mục tiêu kịch bản");
      }
      const requests = await tx.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, revisionId));
      const usedKeys = [...new Set(parsedScript.data.scenes.flatMap((scene) => scene.assetKeys))];
      if (requests.length !== usedKeys.length || usedKeys.some((key) => !requests.some((request) => request.temporaryKey === key && request.status === "bound"))) {
        throw new Error("Phải phân giải asset request và gắn biến thể đã duyệt cho mọi asset key trước khi duyệt script");
      }
      for (const request of requests) {
        if (!request.assetId || !request.state || !video) throw new Error("Asset binding thiếu asset, state hoặc series");
        const [binding] = await tx.select({ asset: assets, variant: assetVariants }).from(assets).innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
          .where(and(eq(assets.id, request.assetId), eq(assets.seriesId, video.seriesId), eq(assets.status, "approved"), eq(assetVariants.state, request.state), eq(assetVariants.status, "approved"))).limit(1);
        if (!binding) throw new Error("Asset binding không còn được duyệt hoặc không thuộc đúng series");
      }
    }
    await tx.insert(algorithmDecisions).values({ videoId, revisionId, decision: "approved", reason: "", expectedFingerprint });
    await tx.update(algorithmRevisions).set({ status: "approved" }).where(eq(algorithmRevisions.id, revisionId));
    const nextStage = stage === "combo" ? "script" : stage === "script" ? "voice" : stage === "voice" ? "animation" : "render";
    await tx.update(algorithmWorkflows).set({ [pointers.accepted]: revisionId, stage: nextStage }).where(eq(algorithmWorkflows.videoId, videoId));
  });
}

export async function rejectAlgorithmOutput(videoId: string, outputId: string, expectedFingerprint: string, reason: string) {
  const db = getDb();
  if (reason.trim().length < 5) throw new Error("Lý do từ chối video phải có ít nhất 5 ký tự");
  await db.transaction(async (tx) => {
    const [workflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
    if (!workflow || workflow.activeOutputId !== outputId) throw new Error("Output không còn là video hiện hành");
    const [output] = await tx.select().from(algorithmOutputs).where(and(eq(algorithmOutputs.id, outputId), eq(algorithmOutputs.videoId, videoId))).limit(1);
    if (!output || output.status !== "pending_review" || output.inputFingerprint !== expectedFingerprint) throw new Error("Video không còn chờ duyệt hoặc fingerprint không khớp");
    if (!output.filePath) throw new Error("Output không có file video để từ chối");
    await tx.insert(algorithmDecisions).values({ videoId, outputId, decision: "rejected", reason: reason.trim(), expectedFingerprint });
    await tx.update(algorithmOutputs).set({ status: "rejected", error: reason.trim() }).where(eq(algorithmOutputs.id, outputId));
    await tx.update(algorithmWorkflows).set({ activeOutputId: null, acceptedOutputId: null, stage: "animation", concurrencyVersion: workflow.concurrencyVersion + 1 }).where(eq(algorithmWorkflows.videoId, videoId));
  });
}

export async function approveAlgorithmOutput(videoId: string, outputId: string, expectedFingerprint: string) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const [workflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
    if (!workflow || workflow.activeOutputId !== outputId) throw new Error("Output không còn là video hiện hành");
    const [output] = await tx.select().from(algorithmOutputs).where(and(eq(algorithmOutputs.id, outputId), eq(algorithmOutputs.videoId, videoId))).limit(1);
    if (!output || output.status !== "pending_review" || output.inputFingerprint !== expectedFingerprint || !output.filePath) throw new Error("Video không còn chờ duyệt, chưa có MP4 hoặc fingerprint không khớp");
    await tx.insert(algorithmDecisions).values({ videoId, outputId, decision: "approved", reason: "", expectedFingerprint });
    await tx.update(algorithmOutputs).set({ status: "approved" }).where(eq(algorithmOutputs.id, outputId));
    await tx.update(algorithmWorkflows).set({ acceptedOutputId: outputId, stage: "done", concurrencyVersion: workflow.concurrencyVersion + 1 }).where(eq(algorithmWorkflows.videoId, videoId));
  });
}

export async function prepareRender(videoId: string, expectedConcurrencyVersion: number) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1, stage: "render" })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại");
    const [workflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
    if (!workflow.acceptedAnimationId) throw new Error("Cần duyệt animation trước khi render");
    const [revision] = await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, workflow.acceptedAnimationId)).limit(1);
    if (!revision || revision.status !== "approved") throw new Error("Animation chưa được duyệt");
    const animation = AlgorithmAnimationSchema.parse(revision.content);
    const voiceContext = await loadApprovedVoiceContext(tx, videoId);
    const [voiceEdge] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id)).limit(1);
    if (!voiceEdge || voiceEdge.inputRevisionId !== voiceContext.voice.id) throw new Error("Animation không còn tham chiếu voice hiện đang được duyệt");
    const animationCheck = checkAnimation(animation, voiceContext.timeline);
    if (animationCheck.errors.length) throw new Error(`Animation không hợp lệ: ${animationCheck.errors[0]}`);
    const script = voiceContext.script;
    const scriptContent = { success: true as const, data: voiceContext.scriptContent };
    const requests = await tx.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, script.id));
    if (requests.some((request) => request.status !== "bound" || !request.assetId || !request.state)) throw new Error("Mọi asset request của script phải được binding trước khi render");
    const usedKeys = [...new Set((scriptContent.data).scenes.flatMap((scene) => scene.assetKeys))];
    if (requests.length !== usedKeys.length || usedKeys.some((key) => !requests.some((request) => request.temporaryKey === key && request.status === "bound"))) throw new Error("Asset requests không khớp script đã duyệt");
    const assetEntries = requests.map(({ temporaryKey, assetId, state }) => ({ temporaryKey, assetId, state })).sort((a, b) => a.temporaryKey.localeCompare(b.temporaryKey));
    const voiceEntries = voiceContext.timeline.scenes.flatMap((scene) => scene.cues.map((cue) => ({ cueId: cue.cueId, fingerprint: voiceContext.clips.find((clip) => clip.cueId === cue.cueId)!.fingerprint })));
    const manifest = { assets: assetEntries, voice: voiceEntries };
    const [video] = await tx.select({ seriesId: videos.seriesId }).from(videos).where(eq(videos.id, videoId)).limit(1);
    for (const request of requests) {
      const [approved] = await tx.select({ assetId: assets.id }).from(assets).innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
        .where(and(eq(assets.id, request.assetId!), eq(assets.seriesId, video?.seriesId ?? ""), eq(assets.status, "approved"), eq(assetVariants.state, request.state!), eq(assetVariants.status, "approved"))).limit(1);
      if (!approved) throw new Error("Asset binding không còn approved trong series của video");
    }
    const requestSnapshot = { animationRevisionId: revision.id, scriptRevisionId: script.id, voiceRevisionId: voiceContext.voice.id, scriptFingerprint: script.inputFingerprint, assetManifest: manifest };
    const outputId = randomUUID();
    const inputSnapshot = { ...requestSnapshot, outputId };
    const [activeOutput] = workflow.activeOutputId
      ? await tx.select().from(algorithmOutputs).where(eq(algorithmOutputs.id, workflow.activeOutputId)).limit(1)
      : [];
    if (activeOutput?.status === "generating") throw new Error("Render đang chạy; không thể xếp render trùng");
    const [run] = await tx.insert(algorithmGenerationRuns).values({
      videoId, stage: "render", threadId: `algorithm-render:${videoId}:${randomUUID()}`, requestKey: randomUUID(),
      inputSnapshot, inputFingerprint: revision.inputFingerprint, status: "queued", contractVersion: 1,
    }).returning({ id: algorithmGenerationRuns.id });
    const [output] = await tx.insert(algorithmOutputs).values({ id: outputId, videoId, animationRevisionId: revision.id, inputFingerprint: revision.inputFingerprint, rendererVersion: ALGORITHM_RENDERER_VERSION, assetManifest: manifest, durationFrames: animation.durationFrames, status: "generating" }).returning({ id: algorithmOutputs.id });
    const jobRunId = await enqueueJobInTransaction(tx, ALGORITHM_STAGE_JOBS.render, { generationRunId: run.id, outputId: output.id }, { type: "algorithm_workflow", id: videoId });
    await tx.update(algorithmGenerationRuns).set({ jobRunId }).where(eq(algorithmGenerationRuns.id, run.id));
    await tx.update(algorithmWorkflows).set({ activeOutputId: output.id, acceptedOutputId: null }).where(eq(algorithmWorkflows.videoId, videoId));
    return { runId: run.id, jobRunId };
  });
}

export async function validateStagePayload(stage: "combo" | "script" | "animation", payload: unknown) {
  const parsed = schemas[stage].safeParse(payload);
  if (!parsed.success) throw new Error(parsed.error.issues.slice(0, 10).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  if (stage === "combo") {
    const combo = parsed.data as AlgorithmComboV1;
    if (combo.outline.reduce((total, item) => total + item.seconds, 0) !== combo.targetSeconds) {
      throw new Error("Tổng thời lượng outline phải bằng thời lượng mục tiêu combo");
    }
  }
  if (stage === "script") {
    const script = parsed.data as AlgorithmScriptV1;
    if (script.scenes.reduce((total, scene) => total + scene.seconds, 0) !== script.targetSeconds) {
      throw new Error("Tổng thời lượng các cảnh phải bằng thời lượng mục tiêu kịch bản");
    }
  }
  if (stage === "animation") {
    const animation = parsed.data as AlgorithmAnimationV2;
    const ids = new Set<string>();
    for (const scene of animation.scenes) {
      if (ids.has(scene.id) || scene.from + scene.durationFrames > animation.durationFrames) throw new Error("Animation scene ID trùng hoặc vượt tổng duration");
      ids.add(scene.id);
    }
  }
  return parsed.data as RevisionContent;
}

export async function enqueueAlgorithmJob(type: (typeof ALGORITHM_STAGE_JOBS)[keyof typeof ALGORITHM_STAGE_JOBS], videoId: string, payload: JobPayload) {
  return enqueueJob(type, payload, { type: "algorithm_workflow", id: videoId });
}
