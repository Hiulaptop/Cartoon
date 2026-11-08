import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { assets, assetVariants, comfyImageRuns, jobRuns, reviews, series } from "@/lib/db/schema";
import { lockVariantCommand, type Tx, type VariantKey } from "@/lib/assets/generation-lock";
import { isAllowedState } from "@/lib/assets/naming";
import { generationSizeInfo, parseGenerationSize } from "@/lib/assets/generation-size";
import { imagePrompt } from "@/lib/assets/prompts";
import { PIXEL_FARM_SERIES } from "@/lib/assets/pixel-farm";
import { enqueueJobInTransaction, requeueJobInTransaction } from "@/lib/queue/jobs";
import { ACTIVE_STATES, RunSnapshotSchema, WorkflowRefSchema, type ComfyRunView } from "./contracts";
import { getComfyConfig } from "./config";
import { canonicalHash, loadWorkflow, parameterizeWorkflow } from "./registry";
import { findCorrelatedPrompt, observePrompt } from "./client";

export async function assertNoActiveComfy(tx: Tx, variantId: string): Promise<void> {
  const [active] = await tx.select({ id: comfyImageRuns.id }).from(comfyImageRuns).where(and(eq(comfyImageRuns.variantId, variantId), inArray(comfyImageRuns.state, [...ACTIVE_STATES]))).limit(1);
  if (active) throw new Error("Biến thể còn lượt ComfyUI chưa đối soát; không được tạo lượt mới");
}
export async function assertNoImageDelivery(tx: Tx, key: VariantKey): Promise<void> {
  const result = await tx.execute(sql`SELECT 1 FROM pgmq.q_jobs q JOIN job_runs j ON j.id::text = q.message->>'jobRunId'
    WHERE j.status IN ('queued','running') AND q.message->>'type' IN ('asset.generate_base','asset.generate_variant','algorithm.asset.generate')
    AND q.message->'payload'->>'assetId' = ${key.assetId}
    AND COALESCE(q.message->'payload'->>'state', 'base') = ${key.state} LIMIT 1`);
  if (result.rows.length) throw new Error("Còn job ảnh cũ trong hàng đợi; chờ xử lý trước");
}
export async function lockAssetVariant(tx: Tx, key: VariantKey) {
  const [asset] = await tx.select().from(assets).where(eq(assets.id, key.assetId)).for("update");
  if (!asset || !isAllowedState(asset.kind, key.state)) throw new Error("Asset hoặc trạng thái không hợp lệ");
  const [variant] = await tx.select().from(assetVariants).where(and(eq(assetVariants.assetId, key.assetId), eq(assetVariants.state, key.state))).for("update");
  return { asset, variant };
}
const requestSchema = z.strictObject({ assetId: z.uuid(), state: z.string().min(1), workflow: WorkflowRefSchema, feedback: z.string().min(1).max(10000).optional(), rejectedVariantId: z.uuid().optional() });
export async function requestComfyVariant(value: z.input<typeof requestSchema>): Promise<{ runId: string; jobRunId: string }> {
  const input = requestSchema.parse(value);
  const config = getComfyConfig();
  if (!config.enabled) throw new Error("ComfyUI đang tắt");
  const release = loadWorkflow(input.workflow);
  return getDb().transaction(async (tx) => {
    await lockVariantCommand(tx, input);
    const { asset, variant: existing } = await lockAssetVariant(tx, input);
    await assertNoImageDelivery(tx, input);
    if (existing) await assertNoActiveComfy(tx, existing.id);
    if (input.state === "base" ? asset.status === "approved" : asset.status !== "approved") throw new Error("Trạng thái ảnh gốc không cho phép sinh biến thể này");
    if (input.rejectedVariantId) {
      if (!existing || existing.id !== input.rejectedVariantId || existing.status !== "pending_review" || !input.feedback) throw new Error("Ảnh không còn chờ loại");
      await tx.insert(reviews).values({ targetType: "asset_variant", targetId: existing.id, decision: "rejected", reason: input.feedback });
    } else if (existing && !["failed", "rejected", "draft"].includes(existing.status)) throw new Error("Biến thể không ở trạng thái cho phép tạo lượt mới");
    const size = parseGenerationSize(asset.generationSize);
    const dimensions = size ? generationSizeInfo(size) : release.defaultSize;
    const [owner] = await tx.select({ name: series.name }).from(series).where(eq(series.id, asset.seriesId));
    const positive = imagePrompt(asset.kind, asset.description, input.state, input.feedback, owner?.name === PIXEL_FARM_SERIES ? "pixel" : "cartoon", size);
    const inputs = { positive, negative: "", seed: randomInt(0, 281474976710655), width: dimensions.width, height: dimensions.height };
    const runId = randomUUID();
    const graph = parameterizeWorkflow(release, inputs, runId);
    const snapshot = RunSnapshotSchema.parse({ version: 1, release, inputs, graph, graphHash: canonicalHash(graph), endpointHash: config.endpointHash, clientId: randomUUID(), kind: asset.kind });
    const [variant] = await tx.insert(assetVariants).values({ assetId: asset.id, state: input.state, status: "generating", prompt: positive }).onConflictDoUpdate({ target: [assetVariants.assetId, assetVariants.state], set: { status: "generating", prompt: positive, sourceWidth: null, sourceHeight: null } }).returning();
    const jobRunId = await enqueueJobInTransaction(tx, "asset.comfy_image", { version: 1, runId }, { type: "asset_variant", id: variant.id });
    await tx.insert(comfyImageRuns).values({ id: runId, jobRunId, variantId: variant.id, inputSnapshot: snapshot });
    if (input.state === "base") await tx.update(assets).set({ status: "generating" }).where(eq(assets.id, asset.id));
    return { runId, jobRunId };
  });
}
export async function readRun(runId: string) {
  const [row] = await getDb().select({ run: comfyImageRuns, variant: assetVariants }).from(comfyImageRuns).innerJoin(assetVariants, eq(assetVariants.id, comfyImageRuns.variantId)).where(eq(comfyImageRuns.id, z.uuid().parse(runId)));
  if (!row) throw new Error("Không có lượt ComfyUI");
  return row;
}
export async function lockRun(tx: Tx, runId: string, jobRunId?: string) {
  const [initial] = await tx.select({ variant: assetVariants }).from(comfyImageRuns).innerJoin(assetVariants, eq(assetVariants.id, comfyImageRuns.variantId)).where(eq(comfyImageRuns.id, runId));
  if (!initial) throw new Error("Không có lượt ComfyUI");
  const owner = await lockAssetVariant(tx, initial.variant);
  const [run] = await tx.select().from(comfyImageRuns).where(eq(comfyImageRuns.id, runId)).for("update");
  if (!run || !owner.variant || run.variantId !== owner.variant.id || (jobRunId && run.jobRunId !== jobRunId)) throw new Error("Lượt sinh không còn đúng chủ sở hữu");
  return { ...owner, variant: owner.variant, run };
}
export async function assertNoOtherUpstream(tx: Tx, runId: string): Promise<void> {
  const [other] = await tx.select({ id: comfyImageRuns.id }).from(comfyImageRuns).where(and(ne(comfyImageRuns.id, runId), inArray(comfyImageRuns.state, ["submitting", "submitted", "uncertain"]))).limit(1);
  if (other) throw new Error("Còn lượt ComfyUI upstream chưa được giải quyết");
}
const commandSchema = z.strictObject({ runId: z.uuid(), expectedUpdatedAt: z.iso.datetime() });
async function runCommand<T>(input: z.input<typeof commandSchema>, fn: (tx: Tx, owner: Awaited<ReturnType<typeof lockRun>>) => Promise<T>) {
  const command = commandSchema.parse(input);
  const initial = await readRun(command.runId);
  return getDb().transaction(async (tx) => {
    await lockVariantCommand(tx, initial.variant);
    const owner = await lockRun(tx, command.runId);
    if (owner.run.updatedAt.toISOString() !== command.expectedUpdatedAt) throw new Error("Lượt sinh đã thay đổi; tải lại trang");
    const [job] = await tx.select().from(jobRuns).where(eq(jobRuns.id, owner.run.jobRunId)).for("update");
    if (!job || job.status !== "failed") throw new Error("Job phải dừng và failed trước khi đối soát/tiếp tục");
    return fn(tx, owner);
  });
}
export async function resumeComfyRun(input: z.input<typeof commandSchema>): Promise<void> {
  await runCommand(input, async (tx, { run, variant }) => {
    if (run.state !== "submitted" || !run.promptId || variant.status !== "generating") throw new Error("Chỉ tiếp tục lượt đã có prompt ID; không gửi POST mới");
    await requeueJobInTransaction(tx, run.jobRunId, "asset.comfy_image", { version: 1, runId: run.id }, { type: "asset_variant", id: variant.id });
    await tx.update(comfyImageRuns).set({ error: null, updatedAt: new Date() }).where(eq(comfyImageRuns.id, run.id));
  });
}
export async function abandonComfyRun(input: z.input<typeof commandSchema> & { note: string; workerStopped: true; upstreamChecked: true }): Promise<void> {
  if (input.workerStopped !== true || input.upstreamChecked !== true || !input.note.trim() || input.note.length > 2000) throw new Error("Cần xác nhận dừng worker, kiểm upstream và ghi chú");
  await runCommand({ runId: input.runId, expectedUpdatedAt: input.expectedUpdatedAt }, async (tx, { run, variant }) => {
    if (!ACTIVE_STATES.includes(run.state as typeof ACTIVE_STATES[number])) throw new Error("Lượt sinh đã kết thúc");
    await tx.update(comfyImageRuns).set({ state: "abandoned", note: input.note.trim(), resolvedAt: new Date(), updatedAt: new Date() }).where(eq(comfyImageRuns.id, run.id));
    if (variant.status === "generating") await tx.update(assetVariants).set({ status: "failed" }).where(eq(assetVariants.id, variant.id));
  });
}
export async function inspectComfyRun(input: z.input<typeof commandSchema>): Promise<void> {
  const initial = await readRun(input.runId);
  const snapshot = RunSnapshotSchema.parse(initial.run.inputSnapshot);
  const config = getComfyConfig();
  if (config.endpointHash !== snapshot.endpointHash) throw new Error("Endpoint khác snapshot; không đối soát ở máy chủ khác");
  const signal = AbortSignal.timeout(30000);
  const promptId = initial.run.promptId ?? await findCorrelatedPrompt(config, snapshot.clientId, snapshot.graphHash, signal);
  if (!promptId) throw new Error("Không tìm thấy correlation; KHÔNG có nghĩa an toàn để gửi lại");
  const observation = await observePrompt(config, promptId, snapshot.clientId, snapshot.graphHash, snapshot.release.outputNode, signal);
  if (observation.state === "missing") throw new Error("Không còn bằng chứng trong queue/history; giữ chưa xác định");
  await runCommand(input, async (tx, { run, variant }) => {
    if (!["submitting", "uncertain", "submitted"].includes(run.state)) throw new Error("Lượt không cần đối soát upstream");
    const failed = observation.state === "failed";
    await tx.update(comfyImageRuns).set({ promptId, state: failed ? "failed" : "submitted", error: failed ? "ComfyUI xác nhận lỗi thực thi" : null, updatedAt: new Date(), resolvedAt: failed ? new Date() : null }).where(eq(comfyImageRuns.id, run.id));
    if (failed && variant.status === "generating") await tx.update(assetVariants).set({ status: "failed" }).where(eq(assetVariants.id, variant.id));
  });
}
export async function listAssetComfyRuns(assetId: string): Promise<ComfyRunView[]> {
  const rows = await getDb().select({ run: comfyImageRuns, status: jobRuns.status }).from(comfyImageRuns).innerJoin(assetVariants, eq(assetVariants.id, comfyImageRuns.variantId)).innerJoin(jobRuns, eq(jobRuns.id, comfyImageRuns.jobRunId)).where(eq(assetVariants.assetId, assetId)).orderBy(desc(comfyImageRuns.createdAt)).limit(50);
  return rows.map(({ run, status }) => {
    const snapshot = RunSnapshotSchema.parse(run.inputSnapshot);
    return { id: run.id, variantId: run.variantId, state: run.state as ComfyRunView["state"], jobStatus: status, promptId: run.promptId, workflow: `${snapshot.release.ref.id}@${snapshot.release.ref.revision}`, model: snapshot.release.models.map((m) => m.filename).join(", "), size: `${snapshot.inputs.width}×${snapshot.inputs.height}`, error: run.error, updatedAt: run.updatedAt.toISOString() };
  });
}
