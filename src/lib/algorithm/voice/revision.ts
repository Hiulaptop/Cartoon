import { randomUUID } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";

import { AlgorithmScriptV1Schema } from "@/lib/algorithm/contracts";
import { stageFingerprint } from "@/lib/algorithm/pipeline";
import { getDb } from "@/lib/db/client";
import { algorithmDecisions, algorithmGenerationRuns, algorithmRevisionInputs, algorithmRevisions, algorithmWorkflows } from "@/lib/db/schema";
import { enqueueJobInTransaction } from "@/lib/queue/jobs";

import { checkVoiceAgainstScript } from "./checks";
import { AlgorithmVoiceV1Schema, type AlgorithmVoiceV1 } from "./contract";

// Sửa text/tốc độ/giọng: revision mới nguồn "human" (content đặt ngay lúc insert), job chỉ sinh lại clip có fingerprint mới.
export async function prepareVoiceEdit(videoId: string, content: AlgorithmVoiceV1, expectedConcurrencyVersion: number) {
  const parsed = AlgorithmVoiceV1Schema.parse(content);
  return getDb().transaction(async (tx) => {
    const [reserved] = await tx.update(algorithmWorkflows).set({ concurrencyVersion: expectedConcurrencyVersion + 1 })
      .where(and(eq(algorithmWorkflows.videoId, videoId), eq(algorithmWorkflows.concurrencyVersion, expectedConcurrencyVersion))).returning({ videoId: algorithmWorkflows.videoId });
    if (!reserved) throw new Error("Workflow đã thay đổi; hãy tải lại trước khi tiếp tục");
    const [workflow] = await tx.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
    if (!workflow?.acceptedScriptId) throw new Error("Cần duyệt kịch bản trước khi chỉnh voice");
    const [script] = await tx.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, workflow.acceptedScriptId), eq(algorithmRevisions.status, "approved"))).limit(1);
    const scriptContent = script ? AlgorithmScriptV1Schema.safeParse(script.content) : undefined;
    if (!script || !scriptContent?.success) throw new Error("Kịch bản đã duyệt không hợp lệ");
    const structural = checkVoiceAgainstScript(parsed, scriptContent.data).filter((issue) => issue.kind === "structure");
    if (structural.length) throw new Error(structural[0].message);
    const [active] = workflow.activeVoiceId ? await tx.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, workflow.activeVoiceId)).limit(1) : [];
    if (active?.status === "generating") throw new Error("Voice đang được worker sinh; chờ xong rồi sửa");
    if (active?.status === "pending_review") {
      await tx.insert(algorithmDecisions).values({ videoId, revisionId: active.id, decision: "rejected", reason: "Thay bằng revision voice sửa tay", expectedFingerprint: active.inputFingerprint });
      await tx.update(algorithmRevisions).set({ status: "rejected" }).where(eq(algorithmRevisions.id, active.id));
    }
    const [latest] = await tx.select({ version: algorithmRevisions.version }).from(algorithmRevisions).where(and(eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "voice"))).orderBy(desc(algorithmRevisions.version)).limit(1);
    const inputFingerprint = stageFingerprint("voice", { inputRevisionId: script.id, inputFingerprint: script.inputFingerprint, content: parsed });
    const requestKey = randomUUID();
    const [run] = await tx.insert(algorithmGenerationRuns).values({
      videoId, stage: "voice", threadId: `algorithm-voice:${videoId}:${requestKey}`, requestKey,
      inputSnapshot: { inputRevisionId: script.id, inputFingerprint: script.inputFingerprint, edit: true }, inputFingerprint, status: "queued", contractVersion: 1,
    }).returning({ id: algorithmGenerationRuns.id });
    const [revision] = await tx.insert(algorithmRevisions).values({ videoId, stage: "voice", version: (latest?.version ?? 0) + 1, content: parsed, source: "human", status: "generating", generationRunId: run.id, inputFingerprint }).returning();
    await tx.insert(algorithmRevisionInputs).values({ videoId, revisionId: revision.id, inputRevisionId: script.id });
    await tx.update(algorithmWorkflows).set({
      activeVoiceId: revision.id, acceptedVoiceId: null, activeAnimationId: null, acceptedAnimationId: null, activeOutputId: null, acceptedOutputId: null, stage: "voice",
    }).where(eq(algorithmWorkflows.videoId, videoId));
    const jobRunId = await enqueueJobInTransaction(tx, "algorithm.voice.generate", { revisionId: revision.id }, { type: "algorithm_workflow", id: videoId });
    await tx.update(algorithmGenerationRuns).set({ jobRunId }).where(eq(algorithmGenerationRuns.id, run.id));
    return { revision, jobRunId };
  });
}
