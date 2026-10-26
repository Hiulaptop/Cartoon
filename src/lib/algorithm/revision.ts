import { createHash, randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmDecisions, algorithmGenerationRuns, algorithmRevisionInputs, algorithmRevisions, algorithmWorkflows, videos } from "@/lib/db/schema";
import { AlgorithmProblemV1Schema, AlgorithmSolutionV1Schema, type AlgorithmProblemV1, type AlgorithmSolutionV1 } from "@/lib/algorithm/contracts";
import { enqueueJobInTransaction } from "@/lib/queue/jobs";

export function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function enqueueSolutionGeneration(videoId: string, expectedConcurrencyVersion: number, feedback = "", retryRevisionId?: string, model?: string): Promise<{ revisionId: string; requestKey: string }> {
  if (feedback.length > 20_000) throw new Error("Phản hồi quá dài");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi sinh lời giải");
    const [current] = await tx.select({ video: videos, workflow: algorithmWorkflows })
      .from(videos).innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    if (!current?.workflow.acceptedProblemId) throw new Error("Cần duyệt đề bài trước khi sinh lời giải");
    const [problem] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.id, current.workflow.acceptedProblemId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "problem"))).limit(1);
    if (!problem || problem.status !== "approved") throw new Error("Đề bài được chấp nhận không còn hợp lệ");

    const [latest] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "solution")))
      .orderBy(desc(algorithmRevisions.version)).limit(1);
    if (latest?.status === "generating") throw new Error("Đang có yêu cầu sinh lời giải chạy");
    if (retryRevisionId && latest?.id !== retryRevisionId) throw new Error("Revision lời giải đã đổi; tải lại trước khi sinh lại");
    const oldSolution = current.workflow.activeSolutionId
      ? (await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, current.workflow.activeSolutionId)).limit(1))[0]
      : undefined;
    if (oldSolution?.status === "pending_review" && !retryRevisionId) throw new Error("Hãy duyệt hoặc từ chối lời giải hiện tại trước khi yêu cầu bản mới");
    if (retryRevisionId && oldSolution?.status !== "rejected" && oldSolution?.status !== "failed") throw new Error("Chỉ sinh lại được sau khi lời giải bị từ chối hoặc lỗi");
    const revisionId = randomUUID();
    const requestKey = randomUUID();
    const inputSnapshot = { problemRevisionId: problem.id, problem: problem.content, problemFingerprint: problem.inputFingerprint, seriesId: current.video.seriesId, feedback, ...(model ? { model } : {}) };
    const inputFingerprint = fingerprint(inputSnapshot);
    const [run] = await tx.insert(algorithmGenerationRuns).values({
      videoId, stage: "solution", threadId: `algorithm-solution:${videoId}:${requestKey}`, requestKey,
      inputSnapshot, inputFingerprint, status: "queued", contractVersion: 2,
    }).returning({ id: algorithmGenerationRuns.id });
    const [revision] = await tx.insert(algorithmRevisions).values({
      id: revisionId, videoId, stage: "solution", version: (latest?.version ?? 0) + 1, contractVersion: 2,
      content: {}, source: "llm", status: "generating", generationRunId: run.id, inputFingerprint,
    }).returning({ id: algorithmRevisions.id });
    await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId, inputRevisionId: problem.id });
    if (latest?.status === "pending_review" || latest?.status === "draft" || latest?.status === "failed") {
      await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, latest.id));
    }
    await tx.update(algorithmWorkflows).set({
      activeSolutionId: revision.id, acceptedSolutionId: null, stage: "solution",
      activeComboId: null, acceptedComboId: null, activeScriptId: null, acceptedScriptId: null,
      activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null, activeAnimationId: null, acceptedAnimationId: null,
      activeOutputId: null, acceptedOutputId: null,
    }).where(eq(algorithmWorkflows.videoId, videoId));
    const jobRunId = await enqueueJobInTransaction(tx, "algorithm.solution.generate", { generationRunId: run.id, revisionId }, { type: "algorithm_workflow", id: videoId });
    await tx.update(algorithmGenerationRuns).set({ jobRunId }).where(eq(algorithmGenerationRuns.id, run.id));
    return { revisionId: revision.id, requestKey };
  });
}

export async function rejectAndRegenerateSolution(videoId: string, revisionId: string, expectedFingerprint: string, expectedConcurrencyVersion: number, reason: string, model?: string): Promise<void> {
  const feedback = reason.trim();
  if (feedback.length < 5 || feedback.length > 20_000) throw new Error("Lý do từ chối phải từ 5 đến 20.000 ký tự");
  const db = getDb();
  await db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi từ chối");
    const [current] = await tx.select({ video: videos, workflow: algorithmWorkflows }).from(videos)
      .innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    const [revision] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.id, revisionId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "solution"))).limit(1);
    if (!current || !revision || current.workflow.activeSolutionId !== revision.id || revision.status !== "pending_review" || revision.source !== "llm") throw new Error("Lời giải LLM không còn ở trạng thái chờ duyệt");
    if (revision.inputFingerprint !== expectedFingerprint) throw new Error("Fingerprint không khớp; tải lại lời giải");
    const [input] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id)).limit(1);
    if (!input || input.inputRevisionId !== current.workflow.acceptedProblemId) throw new Error("Lời giải dựa trên đề không còn được chấp nhận");
    const [problem] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, input.inputRevisionId), eq(algorithmRevisions.stage, "problem"))).limit(1);
    if (!problem || problem.status !== "approved") throw new Error("Đề bài được chấp nhận không còn hợp lệ");

    await tx.insert(algorithmDecisions).values({ videoId, revisionId, decision: "rejected", reason: feedback, expectedFingerprint });
    await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, revision.id));
    const [latest] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "solution"))).orderBy(desc(algorithmRevisions.version)).limit(1);
    const requestKey = randomUUID();
    const inputSnapshot = { problemRevisionId: problem.id, problem: problem.content, problemFingerprint: problem.inputFingerprint, seriesId: current.video.seriesId, feedback, ...(model ? { model } : {}) };
    const inputFingerprint = fingerprint(inputSnapshot);
    const [run] = await tx.insert(algorithmGenerationRuns).values({ videoId, stage: "solution", threadId: `algorithm-solution:${videoId}:${requestKey}`, requestKey, inputSnapshot, inputFingerprint, status: "queued", contractVersion: 2 }).returning({ id: algorithmGenerationRuns.id });
    const [nextRevision] = await tx.insert(algorithmRevisions).values({ videoId, stage: "solution", version: (latest?.version ?? 0) + 1, contractVersion: 2, content: {}, source: "llm", status: "generating", generationRunId: run.id, inputFingerprint }).returning({ id: algorithmRevisions.id });
    await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId: nextRevision.id, inputRevisionId: problem.id });
    await tx.update(algorithmWorkflows).set({
      activeSolutionId: nextRevision.id, acceptedSolutionId: null, stage: "solution",
      activeComboId: null, acceptedComboId: null, activeScriptId: null, acceptedScriptId: null,
      activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null, activeAnimationId: null, acceptedAnimationId: null,
      activeOutputId: null, acceptedOutputId: null,
    }).where(eq(algorithmWorkflows.videoId, videoId));
    const jobRunId = await enqueueJobInTransaction(tx, "algorithm.solution.generate", { generationRunId: run.id, revisionId: nextRevision.id }, { type: "algorithm_workflow", id: videoId });
    await tx.update(algorithmGenerationRuns).set({ jobRunId }).where(eq(algorithmGenerationRuns.id, run.id));
  });
}

export async function startManualSolutionRevision(videoId: string, input: AlgorithmSolutionV1, expectedConcurrencyVersion: number) {
  const content = AlgorithmSolutionV1Schema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi lưu");
    const [current] = await tx.select({ workflow: algorithmWorkflows })
      .from(videos).innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    if (!current?.workflow.acceptedProblemId) throw new Error("Cần duyệt đề bài trước khi nhập lời giải");
    const [problem] = await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, current.workflow.acceptedProblemId)).limit(1);
    if (!problem || problem.status !== "approved") throw new Error("Đề bài được chấp nhận không còn hợp lệ");
    const [latest] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "solution"))).orderBy(desc(algorithmRevisions.version)).limit(1);
    if (latest?.status === "generating") throw new Error("Đang có yêu cầu sinh lời giải chạy");
    const revisionId = randomUUID();
    const oldSolution = current.workflow.activeSolutionId
      ? (await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, current.workflow.activeSolutionId)).limit(1))[0]
      : undefined;
    if (oldSolution?.status === "pending_review" || oldSolution?.status === "draft") {
      await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, oldSolution.id));
      if (oldSolution.status === "pending_review") {
        await tx.insert(algorithmDecisions).values({ videoId, revisionId: oldSolution.id, decision: "rejected", reason: "Thay bằng revision lời giải mới", expectedFingerprint: oldSolution.inputFingerprint });
      }
    }
    const [revision] = await tx.insert(algorithmRevisions).values({
      id: revisionId, videoId, stage: "solution", version: (latest?.version ?? 0) + 1, contractVersion: 1, content,
      source: "human", status: "pending_review", inputFingerprint: fingerprint({ problemId: problem.id, problemFingerprint: problem.inputFingerprint, content }),
    }).returning();
    await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId: revision.id, inputRevisionId: problem.id });
    await tx.update(algorithmWorkflows).set({ activeSolutionId: revision.id, acceptedSolutionId: null, stage: "solution" }).where(eq(algorithmWorkflows.videoId, videoId));
    return revision;
  });
}

export async function updateAlgorithmRevisionStatus(revisionId: string, status: "pending_review" | "failed") {
  await getDb().update(algorithmRevisions).set({ status }).where(eq(algorithmRevisions.id, revisionId));
}

export async function createProblemRevision(videoId: string, input: AlgorithmProblemV1, expectedConcurrencyVersion: number) {
  const content = AlgorithmProblemV1Schema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi lưu");
    const [current] = await tx.select({ video: videos, workflow: algorithmWorkflows })
      .from(videos).innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    if (!current) throw new Error("Không có workflow giảng thuật toán");

    const [latest] = await tx.select({ version: algorithmRevisions.version }).from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "problem")))
      .orderBy(desc(algorithmRevisions.version)).limit(1);
    const version = (latest?.version ?? 0) + 1;
    const revisionId = randomUUID();
    const inputFingerprint = fingerprint({ seriesId: current.video.seriesId, content });
    const [revision] = await tx.insert(algorithmRevisions).values({
      id: revisionId, videoId, stage: "problem", version, contractVersion: 1, content,
      source: "human", status: "pending_review", inputFingerprint,
    }).returning();
    if (current.workflow.activeProblemId) {
      await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId, inputRevisionId: current.workflow.activeProblemId });
    }
    const oldProblem = current.workflow.activeProblemId
      ? (await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, current.workflow.activeProblemId)).limit(1))[0]
      : undefined;
    if (oldProblem?.status === "pending_review" || oldProblem?.status === "draft") {
      await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, oldProblem.id));
    }
    if (oldProblem?.status === "pending_review") {
      await tx.insert(algorithmDecisions).values({ videoId, revisionId: oldProblem.id, decision: "rejected", reason: "Thay bằng revision đề mới", expectedFingerprint: oldProblem.inputFingerprint });
    }
    await tx.update(algorithmWorkflows).set({
      activeProblemId: revision.id, acceptedProblemId: null, stage: "problem",
      activeSolutionId: null, acceptedSolutionId: null, activeComboId: null, acceptedComboId: null,
      activeScriptId: null, acceptedScriptId: null, activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null,
      activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null,
    }).where(eq(algorithmWorkflows.videoId, videoId));
    return revision;
  });
}

export async function enqueueProblemGeneration(videoId: string, expectedConcurrencyVersion: number, input: { theme: string; topic: string }, model?: string): Promise<{ revisionId: string }> {
  const theme = input.theme.trim();
  const topic = input.topic.trim();
  if (theme.length < 3 || theme.length > 500) throw new Error("Chủ đề phải từ 3 đến 500 ký tự");
  if (topic.length > 200) throw new Error("Dạng thuật toán tối đa 200 ký tự");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi gửi chủ đề");
    const [current] = await tx.select({ video: videos, workflow: algorithmWorkflows })
      .from(videos).innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    if (!current) throw new Error("Không có workflow giảng thuật toán");
    const [latest] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "problem")))
      .orderBy(desc(algorithmRevisions.version)).limit(1);
    if (latest?.status === "generating") throw new Error("Đang có yêu cầu viết truyện chạy; chờ worker xong");
    const oldProblem = current.workflow.activeProblemId
      ? (await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, current.workflow.activeProblemId)).limit(1))[0]
      : undefined;
    if (oldProblem?.status === "pending_review" || oldProblem?.status === "draft") {
      await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, oldProblem.id));
    }
    if (oldProblem?.status === "pending_review") {
      await tx.insert(algorithmDecisions).values({ videoId, revisionId: oldProblem.id, decision: "rejected", reason: "Thay bằng truyện và đề mới từ chủ đề", expectedFingerprint: oldProblem.inputFingerprint });
    }
    const requestKey = randomUUID();
    const inputSnapshot = { theme, topic, seriesId: current.video.seriesId, ...(model ? { model } : {}) };
    const inputFingerprint = fingerprint(inputSnapshot);
    const [run] = await tx.insert(algorithmGenerationRuns).values({
      videoId, stage: "problem", threadId: `algorithm-problem:${videoId}:${requestKey}`, requestKey,
      inputSnapshot, inputFingerprint, status: "queued", contractVersion: 2,
    }).returning({ id: algorithmGenerationRuns.id });
    const [revision] = await tx.insert(algorithmRevisions).values({
      videoId, stage: "problem", version: (latest?.version ?? 0) + 1, contractVersion: 2,
      content: {}, source: "llm", status: "generating", generationRunId: run.id, inputFingerprint,
    }).returning({ id: algorithmRevisions.id });
    await tx.update(algorithmWorkflows).set({
      activeProblemId: revision.id, acceptedProblemId: null, stage: "problem",
      activeSolutionId: null, acceptedSolutionId: null, activeComboId: null, acceptedComboId: null,
      activeScriptId: null, acceptedScriptId: null, activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null,
      activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null,
    }).where(eq(algorithmWorkflows.videoId, videoId));
    const jobRunId = await enqueueJobInTransaction(tx, "algorithm.problem.generate", { generationRunId: run.id, revisionId: revision.id }, { type: "algorithm_workflow", id: videoId });
    await tx.update(algorithmGenerationRuns).set({ jobRunId }).where(eq(algorithmGenerationRuns.id, run.id));
    return { revisionId: revision.id };
  });
}

export async function createSolutionRevision(videoId: string, input: AlgorithmSolutionV1, expectedConcurrencyVersion: number) {
  const content = AlgorithmSolutionV1Schema.parse(input);
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi lưu");
    const [current] = await tx.select({ workflow: algorithmWorkflows })
      .from(videos).innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    if (!current) throw new Error("Không có workflow giảng thuật toán");
    if (!current.workflow.acceptedProblemId) throw new Error("Cần duyệt đề bài trước khi nhập lời giải");
    const [problem] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, current.workflow.acceptedProblemId), eq(algorithmRevisions.stage, "problem"))).limit(1);
    if (!problem || problem.status !== "approved") throw new Error("Đề bài được chấp nhận không còn hợp lệ");

    const [latest] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "solution")))
      .orderBy(desc(algorithmRevisions.version)).limit(1);
    if (latest?.status === "generating") throw new Error("Đang có yêu cầu sinh lời giải chạy");
    const version = (latest?.version ?? 0) + 1;
    const revisionId = randomUUID();
    const oldSolution = current.workflow.activeSolutionId
      ? (await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, current.workflow.activeSolutionId)).limit(1))[0]
      : undefined;
    if (oldSolution?.status === "pending_review" || oldSolution?.status === "draft") {
      await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, oldSolution.id));
      if (oldSolution.status === "pending_review") {
        await tx.insert(algorithmDecisions).values({ videoId, revisionId: oldSolution.id, decision: "rejected", reason: "Thay bằng revision lời giải mới", expectedFingerprint: oldSolution.inputFingerprint });
      }
    }
    const inputFingerprint = fingerprint({ problemFingerprint: problem.inputFingerprint, problemRevisionId: problem.id, content });
    const [revision] = await tx.insert(algorithmRevisions).values({
      id: revisionId, videoId, stage: "solution", version, contractVersion: 1, content,
      source: "human", status: "pending_review", inputFingerprint,
    }).returning();
    await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId, inputRevisionId: problem.id });
    await tx.update(algorithmWorkflows).set({
      activeSolutionId: revision.id, acceptedSolutionId: null, activeComboId: null, acceptedComboId: null,
      activeScriptId: null, acceptedScriptId: null, activeAssetsId: null, acceptedAssetsId: null, activeVoiceId: null, acceptedVoiceId: null,
      activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null,
      stage: "solution",
    }).where(eq(algorithmWorkflows.videoId, videoId));
    return revision;
  });
}

export async function decideAlgorithmRevision(videoId: string, revisionId: string, expectedFingerprint: string, expectedConcurrencyVersion: number, decision: "approved" | "rejected", reason: string) {
  if (decision === "rejected" && reason.trim().length < 5) throw new Error("Lý do từ chối phải có ít nhất 5 ký tự");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion)))
      .returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi duyệt");
    const [current] = await tx.select({ workflow: algorithmWorkflows })
      .from(videos).innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
      .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
    if (!current) throw new Error("Không có workflow giảng thuật toán");
    const [revision] = await tx.select().from(algorithmRevisions)
      .where(and(eq(algorithmRevisions.id, revisionId), eq(algorithmRevisions.videoId, videoId))).limit(1);
    if (!revision || !["problem", "solution"].includes(revision.stage)) throw new Error("Không tìm thấy revision cần duyệt");
    const activeId = revision.stage === "problem" ? current.workflow.activeProblemId : current.workflow.activeSolutionId;
    if (activeId !== revision.id || revision.status !== "pending_review") throw new Error("Revision không còn là bản hiện hành chờ duyệt");
    if (revision.inputFingerprint !== expectedFingerprint) throw new Error("Fingerprint không khớp; tải lại revision");
    if (revision.stage === "solution") {
      const [input] = await tx.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id)).limit(1);
      if (!input || input.inputRevisionId !== current.workflow.acceptedProblemId) throw new Error("Lời giải dựa trên đề không còn được chấp nhận");
    }
    await tx.insert(algorithmDecisions).values({ videoId, revisionId, decision, reason: decision === "rejected" ? reason.trim() : "", expectedFingerprint });
    if (revision.stage === "problem" && decision === "approved" && current.workflow.acceptedProblemId !== revision.id) {
      const [oldAcceptedSolution] = current.workflow.acceptedSolutionId
        ? await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, current.workflow.acceptedSolutionId)).limit(1)
        : [];
      if (oldAcceptedSolution && oldAcceptedSolution.status !== "generating") {
        await tx.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, oldAcceptedSolution.id));
      }
    }
    await tx.update(algorithmRevisions).set({ status: decision }).where(eq(algorithmRevisions.id, revision.id));
    await tx.update(algorithmWorkflows).set({
      acceptedProblemId: revision.stage === "problem" && decision === "approved" ? revision.id : revision.stage === "problem" ? null : current.workflow.acceptedProblemId,
      acceptedSolutionId: revision.stage === "solution" ? (decision === "approved" ? revision.id : null) : revision.stage === "problem" && decision === "approved" ? null : current.workflow.acceptedSolutionId,
      acceptedComboId: revision.stage === "problem" && decision === "approved" ? null : current.workflow.acceptedComboId,
      acceptedScriptId: revision.stage === "problem" && decision === "approved" ? null : current.workflow.acceptedScriptId,
      acceptedAssetsId: revision.stage === "problem" && decision === "approved" ? null : current.workflow.acceptedAssetsId,
      acceptedVoiceId: revision.stage === "problem" && decision === "approved" ? null : current.workflow.acceptedVoiceId,
      acceptedAnimationId: revision.stage === "problem" && decision === "approved" ? null : current.workflow.acceptedAnimationId,
      acceptedOutputId: revision.stage === "problem" && decision === "approved" ? null : current.workflow.acceptedOutputId,
      stage: decision === "rejected" ? revision.stage : revision.stage === "problem" ? "solution" : "combo",
    }).where(eq(algorithmWorkflows.videoId, videoId));
    return { decision, stage: revision.stage, concurrencyVersion: expectedConcurrencyVersion + 1 };
  });
}
