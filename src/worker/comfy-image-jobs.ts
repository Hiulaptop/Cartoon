import { createHash } from "node:crypto";
import { mkdir, link, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import sharp from "sharp";
import { getDb } from "@/lib/db/client";
import { assets, assetVariants, comfyImageRuns, jobRuns } from "@/lib/db/schema";
import { GenerationBusyError, withComfyExecutorLock, withVariantGenerationLock } from "@/lib/assets/generation-lock";
import { keyAndTrim, toPng } from "@/lib/assets/image";
import { ArtifactSchema, RunSnapshotSchema, type ComfyArtifact } from "@/lib/comfy/contracts";
import { getComfyConfig } from "@/lib/comfy/config";
import { ComfyRejectedError, downloadOutput, observePrompt, submitPrompt } from "@/lib/comfy/client";
import { ComfyPreflightRejectedError, readCapabilities } from "@/lib/comfy/preflight";
import { canonicalHash, loadWorkflow } from "@/lib/comfy/registry";
import { assertNoOtherUpstream, lockRun, readRun } from "@/lib/comfy/runs";
import { dataPath, readDataFile } from "@/lib/storage";
import { DeferredJobError, PermanentJobError, type JobHandler } from "./job-types";

const payloadSchema = z.strictObject({ version: z.literal(1), runId: z.uuid() });
const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
async function readOptional(relative: string): Promise<Buffer | null> {
  try { return await readDataFile(relative); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function validatePng(data: Buffer, width?: number, height?: number) {
  if (data.length > 25 * 1024 * 1024 || !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Ảnh ComfyUI không phải PNG hợp lệ hoặc quá lớn");
  const metadata = await sharp(data, { limitInputPixels: 16000000 }).metadata();
  if (metadata.format !== "png" || !metadata.width || !metadata.height || (metadata.pages ?? 1) !== 1 || metadata.width * metadata.height > 16000000 || (width !== undefined && (metadata.width !== width || metadata.height !== height))) throw new Error("Kích thước/định dạng nguồn khác snapshot");
  await sharp(data, { limitInputPixels: 16000000 }).raw().toBuffer();
  return { width: metadata.width, height: metadata.height };
}
async function immutable(relative: string, data: Buffer): Promise<void> {
  const target = dataPath(relative);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, data, { flag: "wx" });
  try { await link(temporary, target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST" || digest(await readDataFile(relative)) !== digest(data)) throw error; }
  finally { await unlink(temporary); }
}
async function artifact(relative: string, data: Buffer, expected?: ComfyArtifact): Promise<ComfyArtifact> {
  const dimensions = await validatePng(data);
  const result = ArtifactSchema.parse({ path: relative, sha256: digest(data), bytes: data.length, ...dimensions });
  if (expected && canonicalHash(expected) !== canonicalHash(result)) throw new Error("Artifact đã lưu không khớp hash/size");
  return result;
}
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export const generateComfyImage: JobHandler = async (payload, ctx) => {
  const { runId } = payloadSchema.parse(payload);
  const initial = await readRun(runId);
  if (initial.run.jobRunId !== ctx.jobRunId) throw new PermanentJobError("Job owner không khớp");
  if (initial.run.state === "succeeded") return { backend: "comfyui", runId, promptId: initial.run.promptId };
  if (["abandoned", "stale", "failed", "uncertain"].includes(initial.run.state)) throw new PermanentJobError("Lượt sinh cần quyết định thủ công hoặc đã kết thúc");
  try {
    return await withComfyExecutorLock(async (executorSignal) => withVariantGenerationLock(initial.variant, async (variantSignal) => {
      const config = getComfyConfig();
      const snapshot = RunSnapshotSchema.parse(initial.run.inputSnapshot);
      if (snapshot.endpointHash !== config.endpointHash) throw new PermanentJobError("Endpoint khác snapshot");
      loadWorkflow(snapshot.release.ref);
      const controller = new AbortController();
      const signal = AbortSignal.any([executorSignal, variantSignal, controller.signal, AbortSignal.timeout(config.timeoutSeconds * 1000)]);
      let heartbeat: Promise<void> | undefined;
      await ctx.extendLock(300);
      const timer = setInterval(() => {
        if (!heartbeat) heartbeat = ctx.extendLock(300).catch(() => { controller.abort(new Error("Không gia hạn được delivery")); }).finally(() => { heartbeat = undefined; });
      }, 20000);
      const change = async (fn: (owner: Awaited<ReturnType<typeof lockRun>>, tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0]) => Promise<void>) => getDb().transaction(async (tx) => {
        const owner = await lockRun(tx, runId, ctx.jobRunId);
        signal.throwIfAborted();
        await fn(owner, tx);
      });
      try {
        let { run } = await readRun(runId);
        if (run.state === "submitting") {
          await change(async ({ run }, tx) => { if (run.state === "submitting") await tx.update(comfyImageRuns).set({ state: "uncertain", error: "Worker dừng sau submitting; cần đối soát", updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId)); });
          throw new PermanentJobError("Không tự gửi lại lượt submitting");
        }
        if (run.state === "prepared") {
          try {
            await readCapabilities(config, snapshot.release, signal);
          } catch (error) {
            const terminal = await getDb().transaction(async (tx) => {
              const owner = await lockRun(tx, runId, ctx.jobRunId);
              const [job] = await tx.select({ metrics: jobRuns.metrics }).from(jobRuns).where(eq(jobRuns.id, ctx.jobRunId)).for("update");
              const deferrals = Number((job?.metrics as { deferrals?: number } | null)?.deferrals ?? 0);
              // Match runner's three-failure budget, excluding executor deferrals.
              const terminal = error instanceof ComfyPreflightRejectedError || signal.aborted || ctx.attempt - deferrals >= 3;
              if (terminal && owner.run.state === "prepared") {
                await tx.update(comfyImageRuns).set({ state: "failed", error: error instanceof ComfyPreflightRejectedError ? error.message : "Preflight không hoàn tất trước POST; cần yêu cầu mới", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId));
                if (owner.variant.status === "generating") await tx.update(assetVariants).set({ status: "failed" }).where(eq(assetVariants.id, owner.variant.id));
              }
              return terminal;
            });
            if (terminal) throw new PermanentJobError("Preflight thất bại trước POST; không có lượt upstream được tạo");
            throw error;
          }
          await change(async ({ run, variant }, tx) => {
            await assertNoOtherUpstream(tx, runId);
            if (run.state !== "prepared" || variant.status !== "generating") throw new PermanentJobError("Lượt sinh không còn sẵn sàng");
            await tx.update(comfyImageRuns).set({ state: "submitting", updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId));
          });
          try {
            signal.throwIfAborted();
            const accepted = await submitPrompt(config, snapshot.graph, snapshot.clientId, signal);
            await change(async ({ run }, tx) => {
              if (run.state !== "submitting") throw new Error("State đổi sau POST");
              await tx.update(comfyImageRuns).set({ state: "submitted", promptId: accepted.promptId, updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId));
            });
          } catch (error) {
            const definite = error instanceof ComfyRejectedError;
            // Persist uncertainty even when the HTTP/lease signal has expired; never submit again.
            await getDb().transaction(async (tx) => {
              const owner = await lockRun(tx, runId, ctx.jobRunId);
              if (owner.run.state !== "submitting") return;
              await tx.update(comfyImageRuns).set({ state: definite ? "failed" : "uncertain", error: definite ? "Graph bị từ chối trước enqueue" : "POST chưa xác định; cần đối soát", updatedAt: new Date(), resolvedAt: definite ? new Date() : null }).where(eq(comfyImageRuns.id, runId));
              if (definite && owner.variant.status === "generating") await tx.update(assetVariants).set({ status: "failed" }).where(eq(assetVariants.id, owner.variant.id));
            });
            throw new PermanentJobError("ComfyUI chưa hoàn tất; không tự gửi lại POST");
          }
          ({ run } = await readRun(runId));
        }
        if (run.state !== "submitted" || !run.promptId) throw new PermanentJobError("Lượt không có prompt ID để tiếp tục");
        const rawPath = `comfy-private/${runId}/source.png`;
        const processedPath = `assets/${initial.variant.assetId}/comfy/${runId}/image.png`;
        let raw = await readOptional(rawPath);
        const expectedRaw = run.rawArtifact ? ArtifactSchema.parse(run.rawArtifact) : undefined;
        if (!raw && expectedRaw) throw new Error("Thiếu raw artifact đã ghi nhận");
        if (!raw) {
          let delay = 2000;
          while (!raw) {
            signal.throwIfAborted();
            let observation;
            try { observation = await observePrompt(config, run.promptId, snapshot.clientId, snapshot.graphHash, snapshot.release.outputNode, signal); delay = 2000; }
            catch { await wait(delay, signal); delay = Math.min(delay * 2, 10000); continue; }
            if (observation.state === "failed") {
              await change(async ({ run, variant }, tx) => {
                if (run.state !== "submitted") throw new Error("State đổi");
                await tx.update(comfyImageRuns).set({ state: "failed", error: "ComfyUI xác nhận lỗi thực thi", resolvedAt: new Date(), updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId));
                await tx.update(assetVariants).set({ status: "failed" }).where(eq(assetVariants.id, variant.id));
              });
              throw new PermanentJobError("ComfyUI xác nhận lỗi thực thi");
            }
            if (observation.state === "completed" && observation.output) raw = await downloadOutput(config, observation.output, signal);
            else await wait(delay, signal);
          }
        }
        await validatePng(raw, snapshot.inputs.width, snapshot.inputs.height);
        const rawArtifact = await artifact(rawPath, raw, expectedRaw);
        await immutable(rawPath, raw);
        await change(async ({ run }, tx) => { if (run.state !== "submitted") throw new Error("State đổi"); await tx.update(comfyImageRuns).set({ rawArtifact, updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId)); });
        let processed = await readOptional(processedPath);
        if (!processed) processed = (snapshot.kind === "bg" ? await toPng(raw) : await keyAndTrim(raw)).data;
        const processedArtifact = await artifact(processedPath, processed, run.processedArtifact ? ArtifactSchema.parse(run.processedArtifact) : undefined);
        await immutable(processedPath, processed);
        await change(async ({ run }, tx) => { if (run.state !== "submitted") throw new Error("State đổi"); await tx.update(comfyImageRuns).set({ processedArtifact, updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId)); });
        await change(async ({ run, variant, asset }, tx) => {
          if (run.state !== "submitted" || variant.status !== "generating") throw new PermanentJobError("Kết quả cũ không được publish");
          await tx.update(assetVariants).set({ status: "pending_review", filePath: processedPath, width: processedArtifact.width, height: processedArtifact.height, sourceWidth: rawArtifact.width, sourceHeight: rawArtifact.height, prompt: snapshot.inputs.positive }).where(eq(assetVariants.id, variant.id));
          if (variant.state === "base") {
            if (asset.status !== "generating") throw new PermanentJobError("Asset base đã thay chủ sở hữu");
            await tx.update(assets).set({ status: "pending_review" }).where(eq(assets.id, asset.id));
          }
          await tx.update(comfyImageRuns).set({ state: "succeeded", error: null, resolvedAt: new Date(), updatedAt: new Date() }).where(eq(comfyImageRuns.id, runId));
        });
        return { backend: "comfyui", runId, promptId: run.promptId, workflow: snapshot.release.ref, raw: rawArtifact.sha256, processed: processedArtifact.sha256 };
      } catch (error) {
        if (signal.aborted) throw new PermanentJobError("Hết thời gian hoặc mất khóa; giữ lượt để đối soát/tiếp tục, không POST mới");
        throw error;
      } finally { clearInterval(timer); await heartbeat; }
    }));
  } catch (error) {
    if (error instanceof GenerationBusyError) throw new DeferredJobError(10, "ComfyUI/biến thể đang bận");
    throw error;
  }
};
