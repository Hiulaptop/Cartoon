"use server";

import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { FormState } from "@/lib/form";
import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmRevisions, algorithmWorkflows, assets, assetVariants, videos } from "@/lib/db/schema";
import { enqueueJob, enqueueJobInTransaction } from "@/lib/queue/jobs";
import { AlgorithmComboV1Schema, AlgorithmProblemV1Schema, AlgorithmSolutionV1Schema } from "@/lib/algorithm/contracts";
import { createAlgorithmDraft } from "@/lib/algorithm/draft";
import { approveAlgorithmOutput, approveAlgorithmStage, prepareManualCombo, prepareRender, prepareStageRevision, rejectAlgorithmOutput } from "@/lib/algorithm/pipeline";
import { createProblemRevision, decideAlgorithmRevision, enqueueProblemGeneration, enqueueSolutionGeneration, rejectAndRegenerateSolution, startManualSolutionRevision } from "@/lib/algorithm/revision";
import { VOICE_SPEED_MAX, VOICE_SPEED_MIN } from "@/lib/algorithm/voice/constants";
import { AlgorithmVoiceV1Schema } from "@/lib/algorithm/voice/contract";
import { prepareVoiceEdit } from "@/lib/algorithm/voice/revision";
import { fetchTTSVoices } from "@/lib/tts/client";
import { chosenModel } from "@/lib/algorithm/model";
import { assertKnownModel } from "@/lib/ninerouter/models";

const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
};
const uuidSchema = z.uuid();

export async function createAlgorithmDesign(_prev: FormState, form: FormData): Promise<FormState> {
  const projectId = text(form, "projectId");
  const seriesId = text(form, "seriesId");
  const title = text(form, "title").trim();
  const problem = text(form, "problem");
  if (!uuidSchema.safeParse(projectId).success || !uuidSchema.safeParse(seriesId).success) return { error: "Project hoặc bộ phim không hợp lệ" };
  if (title.length < 3 || title.length > 160) return { error: "Tiêu đề phải từ 3 đến 160 ký tự" };
  const parsed = AlgorithmProblemV1Schema.safeParse({ version: 1, text: problem });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Đề bài không hợp lệ" };
  try {
    const videoId = await createAlgorithmDraft({ projectId, seriesId, title, problem });
    redirect(`/designs/${videoId}/algorithm`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error ? error.message : "Không tạo được bản nháp" };
  }
}

export async function saveProblem(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const expectedVersion = Number(text(form, "concurrencyVersion"));
  const parsed = AlgorithmProblemV1Schema.safeParse({ version: 1, text: text(form, "problem") });
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !parsed.success) return { error: parsed.success ? "Dữ liệu đề bài không hợp lệ" : parsed.error.issues[0]?.message ?? "Đề bài không hợp lệ" };
  try {
    await createProblemRevision(videoId, parsed.data, expectedVersion);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Không lưu được đề bài" };
  }
}

export async function generateProblem(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const expectedVersion = Number(text(form, "concurrencyVersion"));
  const theme = text(form, "theme").trim();
  const topic = text(form, "topic").trim();
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Dữ liệu yêu cầu viết truyện không hợp lệ" };
  if (theme.length < 3 || theme.length > 500) return { error: "Chủ đề phải từ 3 đến 500 ký tự" };
  try {
    const model = chosenModel(form);
    if (model) await assertKnownModel(model);
    await enqueueProblemGeneration(videoId, expectedVersion, { theme, topic }, model);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không tạo được yêu cầu viết truyện" }; }
}

export async function generateSolution(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const expectedVersion = Number(text(form, "concurrencyVersion"));
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Dữ liệu yêu cầu sinh lời giải không hợp lệ" };
  try {
    const model = chosenModel(form);
    if (model) await assertKnownModel(model);
    await enqueueSolutionGeneration(videoId, expectedVersion, "", undefined, model);
    return {};
  }
  catch (error) { return { error: error instanceof Error ? error.message : "Không tạo được yêu cầu sinh lời giải" }; }
}

export async function regenerateSolution(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const revisionId = text(form, "revisionId");
  const reason = text(form, "reason").trim();
  const expectedVersion = Number(text(form, "concurrencyVersion"));
  if (!uuidSchema.safeParse(videoId).success || !uuidSchema.safeParse(revisionId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1 || reason.length < 5) return { error: "Cần lý do từ chối ít nhất 5 ký tự" };
  try {
    const [revision] = await getDb().select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, revisionId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "solution"))).limit(1);
    if (!revision || revision.status !== "pending_review" || revision.source !== "llm") return { error: "Chỉ từ chối và sinh lại được lời giải LLM đang chờ duyệt" };
    const model = chosenModel(form);
    if (model) await assertKnownModel(model);
    await rejectAndRegenerateSolution(videoId, revisionId, revision.inputFingerprint, expectedVersion, reason, model);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không tạo được yêu cầu sinh lại" }; }
}

export async function saveSolution(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const expectedVersion = Number(text(form, "concurrencyVersion"));
  const parsed = AlgorithmSolutionV1Schema.safeParse({
    version: 1, representation: text(form, "representation"), insight: text(form, "insight"), algorithm: text(form, "algorithm"),
    correctness: text(form, "correctness"), complexity: { time: text(form, "timeComplexity"), memory: text(form, "memoryComplexity"), explanation: text(form, "complexityExplanation") },
    code: text(form, "code"), walkthrough: text(form, "walkthrough"),
    edgeCases: text(form, "edgeCases").split("\n").map((v) => v.trim()).filter(Boolean),
    assumptions: text(form, "assumptions").split("\n").map((v) => v.trim()).filter(Boolean),
    references: text(form, "references").split("\n").map((v) => v.trim()).filter(Boolean),
  });
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !parsed.success) return { error: parsed.success ? "Dữ liệu lời giải không hợp lệ" : parsed.error.issues[0]?.message ?? "Lời giải không hợp lệ" };
  try { await startManualSolutionRevision(videoId, parsed.data, expectedVersion); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không lưu được lời giải" }; }
}

export async function decideRevision(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), revisionId = text(form, "revisionId"), decision = text(form, "decision"), fingerprint = text(form, "expectedFingerprint");
  const expectedVersion = Number(text(form, "concurrencyVersion"));
  if (!uuidSchema.safeParse(videoId).success || !uuidSchema.safeParse(revisionId).success || !/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isInteger(expectedVersion) || expectedVersion < 1 || (decision !== "approved" && decision !== "rejected")) return { error: "Dữ liệu quyết định không hợp lệ" };
  try { await decideAlgorithmRevision(videoId, revisionId, fingerprint, expectedVersion, decision, text(form, "reason")); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không lưu được quyết định" }; }
}

async function beginStage(form: FormData, stage: "combo" | "script" | "animation"): Promise<FormState> {
  const videoId = text(form, "videoId");
  const expectedVersion = Number(text(form, "concurrencyVersion"));
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Dữ liệu workflow không hợp lệ" };
  try {
    const model = chosenModel(form);
    if (model) await assertKnownModel(model);
    await prepareStageRevision(videoId, stage, expectedVersion, undefined, model);
    return {};
  }
  catch (error) { return { error: error instanceof Error ? error.message : `Không thể bắt đầu ${stage}` }; }
}

export async function beginCombo(_prev: FormState, form: FormData): Promise<FormState> { return beginStage(form, "combo"); }
export async function beginScript(_prev: FormState, form: FormData): Promise<FormState> { return beginStage(form, "script"); }
export async function beginAnimation(_prev: FormState, form: FormData): Promise<FormState> { return beginStage(form, "animation"); }

export async function saveManualCombo(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), expectedVersion = Number(text(form, "concurrencyVersion"));
  const parsed = AlgorithmComboV1Schema.safeParse({
    version: 1, hook: text(form, "hook"), objective: text(form, "objective"), framing: text(form, "framing"), structure: text(form, "structure"),
    illustration: text(form, "illustration") || undefined, codePresentation: text(form, "codePresentation") || undefined,
    activity: text(form, "activity") || undefined, verification: text(form, "verification") || undefined, ending: text(form, "ending"),
    targetSeconds: Number(text(form, "targetSeconds")), rationale: text(form, "rationale"), objectiveStatement: text(form, "objectiveStatement"),
    outline: text(form, "outline").split(/\r?\n/).map((line, index) => {
      const [id, seconds, ...purpose] = line.split("|");
      return { id: id?.trim() ?? `part-${index + 1}`, seconds: Number(seconds), purpose: purpose.join("|").trim() };
    }).filter((part) => part.id && part.purpose),
  });
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1 || !parsed.success) {
    return { error: parsed.success ? "Dữ liệu combo không hợp lệ" : parsed.error.issues[0]?.message ?? "Combo không hợp lệ" };
  }
  if (parsed.data.outline.reduce((total, item) => total + item.seconds, 0) !== parsed.data.targetSeconds) return { error: "Tổng thời lượng các phần phải bằng thời lượng mục tiêu" };
  try { await prepareManualCombo(videoId, parsed.data, expectedVersion, text(form, "reason")); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không lưu được combo chọn tay" }; }
}

export async function approveAlgorithmAsset(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), requestId = text(form, "requestId"), target = text(form, "target"), kind = text(form, "kind");
  const brief = text(form, "brief").trim(), name = text(form, "assetName"), state = text(form, "state");
  if (!uuidSchema.safeParse(videoId).success || !uuidSchema.safeParse(requestId).success || (target !== "existing" && target !== "generate")) return { error: "Dữ liệu yêu cầu asset không hợp lệ" };
  const allowedStates: Record<string, string[]> = { chr: ["base", "idle", "talk_a", "talk_b", "happy", "sad", "angry", "surprised", "walk"], bg: ["base", "day", "night", "rain"], prop: ["base", "broken"], fx: ["base"] };
  if (target === "generate" && (!Object.hasOwn(allowedStates, kind) || brief.length < 10 || !allowedStates[kind]?.includes(state))) return { error: "Loại, trạng thái hoặc brief asset không hợp lệ" };
  if (target === "existing" && !uuidSchema.safeParse(name).success) return { error: "Chọn biến thể asset đã duyệt" };
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const [request] = await tx.select().from(algorithmAssetRequests).where(and(eq(algorithmAssetRequests.id, requestId), eq(algorithmAssetRequests.videoId, videoId))).limit(1);
      if (!request || !["open", "failed"].includes(request.status)) throw new Error("Asset request không còn mở để xử lý");
      const [video] = await tx.select().from(videos).where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
      if (!video) throw new Error("Không có video thuật toán");
      if (target === "existing") {
        const [scriptRevision] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, request.scriptRevisionId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "script"))).limit(1);
        if (!scriptRevision || scriptRevision.status !== "pending_review" || !Array.isArray((scriptRevision.content as { scenes?: unknown[] }).scenes)) throw new Error("Chỉ có thể gắn asset vào script đang chờ duyệt");
        const scriptContent = scriptRevision.content as { scenes: { assetKeys?: string[] }[] };
        if (!scriptContent.scenes.some((scene) => scene.assetKeys?.includes(request.temporaryKey))) throw new Error("Asset key không còn được script chờ duyệt sử dụng");
        const [variant] = await tx.select({ variant: assetVariants, asset: assets }).from(assetVariants).innerJoin(assets, eq(assets.id, assetVariants.assetId))
          .where(and(eq(assetVariants.id, name), eq(assetVariants.status, "approved"), eq(assets.status, "approved"), eq(assets.seriesId, video.seriesId))).limit(1);
        if (!variant) throw new Error("Biến thể phải được duyệt và thuộc đúng series của video");
        await tx.update(algorithmAssetRequests).set({ status: "bound", assetId: variant.asset.id, state: variant.variant.state, reason: "" }).where(eq(algorithmAssetRequests.id, request.id));
      return { generated: false };
      }
      const [scriptRevision] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, request.scriptRevisionId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "script"))).limit(1);
      if (!scriptRevision || scriptRevision.status !== "pending_review") throw new Error("Chỉ có thể tạo asset cho script đang chờ duyệt");
      const scriptContent = scriptRevision.content as { scenes?: { assetKeys?: string[] }[] };
      if (!scriptContent.scenes?.some((scene) => scene.assetKeys?.includes(request.temporaryKey))) throw new Error("Asset key không còn được script chờ duyệt sử dụng");
      const assetId = randomUUID();
      await tx.update(algorithmAssetRequests).set({ status: "generating", reason: brief }).where(eq(algorithmAssetRequests.id, request.id));
      const jobRunId = await enqueueJobInTransaction(tx, "algorithm.asset.generate", { assetId, seriesId: video.seriesId, requestId, videoId, kind, brief, displayName: request.temporaryKey }, { type: "algorithm_workflow", id: videoId });
      return { generated: true, jobRunId };
    });
    revalidatePath(`/designs/${videoId}/algorithm`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không xử lý được asset request" }; }
}

export async function resolveAssets(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  if (!uuidSchema.safeParse(videoId).success) return { error: "Dữ liệu không hợp lệ" };
  try {
    const db = getDb();
    const [workflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
    const [script] = workflow?.activeScriptId ? await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, workflow.activeScriptId)).limit(1) : [];
    if (!script || script.status !== "pending_review") return { error: "Chỉ gán asset cho kịch bản đang chờ duyệt" };
    const model = chosenModel(form);
    if (model) await assertKnownModel(model);
    await enqueueJob("algorithm.assets.resolve", { videoId, scriptRevisionId: script.id, ...(model ? { model } : {}) }, { type: "algorithm_workflow", id: videoId });
    revalidatePath(`/designs/${videoId}/algorithm`);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không tạo được yêu cầu gán asset" }; }
}

export async function beginVoice(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), expectedVersion = Number(text(form, "concurrencyVersion"));
  const voice = text(form, "voice"), defaultSpeed = Number(text(form, "defaultSpeed"));
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Dữ liệu workflow không hợp lệ" };
  if (!(defaultSpeed >= VOICE_SPEED_MIN && defaultSpeed <= VOICE_SPEED_MAX)) return { error: `Tốc độ phải trong ${VOICE_SPEED_MIN}–${VOICE_SPEED_MAX}` };
  const voices = (await fetchTTSVoices()).filter((item) => item.is_south);
  if (!voices.some((item) => item.id === voice)) return { error: "Giọng không thuộc danh sách giọng miền Nam của service" };
  try {
    const model = chosenModel(form);
    if (model) await assertKnownModel(model);
    await prepareStageRevision(videoId, "voice", expectedVersion, { voice, defaultSpeed, scenes: [] }, model);
    return {};
  }
  catch (error) { return { error: error instanceof Error ? error.message : "Không thể bắt đầu voice" }; }
}

// Form gửi: voice, defaultSpeed, `speed:<sceneId>` (trống = dùng mặc định), `text:<cueId>`; server dựng từ revision hiện hành nên form không thêm bớt cue được.
export async function saveVoiceEdit(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), revisionId = text(form, "revisionId"), expectedVersion = Number(text(form, "concurrencyVersion"));
  if (!uuidSchema.safeParse(videoId).success || !uuidSchema.safeParse(revisionId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Dữ liệu sửa voice không hợp lệ" };
  const [base] = await getDb().select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, revisionId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "voice"))).limit(1);
  const current = AlgorithmVoiceV1Schema.safeParse(base?.content);
  if (!base || !current.success) return { error: "Không tìm thấy revision voice để sửa" };
  const voice = text(form, "voice");
  const voices = (await fetchTTSVoices()).filter((item) => item.is_south);
  if (!voices.some((item) => item.id === voice)) return { error: "Giọng không thuộc danh sách giọng miền Nam của service" };
  const sceneIds = [...new Set(current.data.cues.map((cue) => cue.sceneId))];
  const scenes = sceneIds.flatMap((sceneId) => {
    const raw = text(form, `speed:${sceneId}`).trim();
    return raw ? [{ sceneId, speed: Number(raw) }] : [];
  });
  const next = AlgorithmVoiceV1Schema.safeParse({
    ...current.data, voice, defaultSpeed: Number(text(form, "defaultSpeed")), scenes,
    cues: current.data.cues.map((cue) => ({ ...cue, spokenText: text(form, `text:${cue.id}`).trim() || cue.spokenText })),
  });
  if (!next.success) return { error: next.error.issues[0]?.message ?? "Voice không hợp lệ" };
  try { await prepareVoiceEdit(videoId, next.data, expectedVersion); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không lưu được chỉnh sửa voice" }; }
}

export async function approveStage(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), revisionId = text(form, "revisionId"), stage = text(form, "stage");
  const fingerprint = text(form, "expectedFingerprint"), expectedVersion = Number(text(form, "concurrencyVersion"));
  if (!uuidSchema.safeParse(videoId).success || !uuidSchema.safeParse(revisionId).success || !["combo", "script", "voice", "animation"].includes(stage) || !/^[a-f0-9]{64}$/.test(fingerprint) || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Dữ liệu duyệt không hợp lệ" };
  try {
    await approveAlgorithmStage(videoId, revisionId, stage as "combo" | "script" | "voice" | "animation", fingerprint, expectedVersion);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không duyệt được revision" }; }
}

export async function beginFinalRender(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), expectedVersion = Number(text(form, "concurrencyVersion"));
  if (!uuidSchema.safeParse(videoId).success || !Number.isInteger(expectedVersion) || expectedVersion < 1) return { error: "Dữ liệu render không hợp lệ" };
  try { await prepareRender(videoId, expectedVersion); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không thể xếp hàng render" }; }
}

export async function rejectFinalVideo(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), outputId = text(form, "outputId"), expectedFingerprint = text(form, "expectedFingerprint"), reason = text(form, "reason").trim();
  if (!uuidSchema.safeParse(videoId).success || !uuidSchema.safeParse(outputId).success || !/^[a-f0-9]{64}$/.test(expectedFingerprint) || reason.length < 5) return { error: "Cần thông tin video và lý do từ chối ít nhất 5 ký tự" };
  try { await rejectAlgorithmOutput(videoId, outputId, expectedFingerprint, reason); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không từ chối được video" }; }
}

export async function approveFinalVideo(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId"), outputId = text(form, "outputId"), expectedFingerprint = text(form, "expectedFingerprint");
  if (!uuidSchema.safeParse(videoId).success || !uuidSchema.safeParse(outputId).success || !/^[a-f0-9]{64}$/.test(expectedFingerprint)) return { error: "Dữ liệu duyệt video không hợp lệ" };
  try { await approveAlgorithmOutput(videoId, outputId, expectedFingerprint); return {}; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không duyệt được video" }; }
}
