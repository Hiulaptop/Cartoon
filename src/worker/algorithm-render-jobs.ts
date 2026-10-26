import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmGenerationRuns, algorithmOutputs, algorithmRevisionInputs, algorithmRevisions, algorithmWorkflows, assets, assetVariants, videos } from "@/lib/db/schema";
import { checkAnimation } from "@/lib/algorithm/animation/check";
import { buildAudioCues, buildCaptions, buildCueWindows, buildSceneAssets } from "@/lib/algorithm/animation/playback";
import { loadBoundAssetFiles } from "@/lib/algorithm/asset-binding";
import { AlgorithmAnimationSchema } from "@/lib/algorithm/animation/schema";
import { loadApprovedVoiceContext } from "@/lib/algorithm/voice/context";
import { dataPath } from "@/lib/storage";
import type { JobPayload } from "@/lib/queue/jobs";

import { PermanentJobError, type JobContext } from "./job-types";

// jsonb của Postgres sắp xếp lại khóa đối tượng (khóa ngắn trước) nên so sánh manifest phải theo dạng chuẩn hóa (sắp khóa), không theo JSON.stringify thô.
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortKeys(item)]));
  return value;
}
const canonicalJson = (value: unknown) => JSON.stringify(sortKeys(value));

function errorText(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
}

const REMOTION_VERSION = "4.0.537";
const LOCK_SECONDS = 120;
const LOCK_EVERY_MS = 15_000;

async function renderAlgorithmVideoInternal(payload: JobPayload, ctx: JobContext) {
  const generationRunId = typeof payload.generationRunId === "string" ? payload.generationRunId : "";
  const outputId = typeof payload.outputId === "string" ? payload.outputId : "";
  if (!generationRunId || !outputId) throw new PermanentJobError("Payload thiếu generationRunId/outputId");
  const db = getDb();
  const [run] = await db.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.id, generationRunId)).limit(1);
  const [output] = await db.select().from(algorithmOutputs).where(eq(algorithmOutputs.id, outputId)).limit(1);
  if (!run || run.stage !== "render" || !output || output.videoId !== run.videoId) throw new PermanentJobError("Generation run/output không hợp lệ");
  const [workflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
  const [video] = await db.select({ seriesId: videos.seriesId }).from(videos).where(eq(videos.id, run.videoId)).limit(1);
  if (!workflow || !video || workflow.acceptedAnimationId !== output.animationRevisionId || workflow.activeOutputId !== output.id) throw new PermanentJobError("Animation/output đầu vào không còn hiện hành");
  const snapshot = run.inputSnapshot as { outputId?: string; animationRevisionId?: string; scriptRevisionId?: string; voiceRevisionId?: string; assetManifest?: { assets: { temporaryKey: string; assetId: string; state: string }[]; voice: { cueId: string; fingerprint: string }[] } };
  if (snapshot.outputId !== output.id || snapshot.animationRevisionId !== output.animationRevisionId) throw new PermanentJobError("Render snapshot không khớp output/animation");
  const [animation] = await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, output.animationRevisionId)).limit(1);
  if (!animation || animation.stage !== "animation" || animation.status !== "approved" || animation.inputFingerprint !== output.inputFingerprint) throw new PermanentJobError("Animation revision/fingerprint không còn hợp lệ");
  const parsed = AlgorithmAnimationSchema.safeParse(animation.content);
  if (!parsed.success) throw new PermanentJobError(`Animation schema không hợp lệ: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  let voiceContext;
  try { voiceContext = await loadApprovedVoiceContext(db, run.videoId); }
  catch (error) { throw new PermanentJobError(errorText(error)); }
  const [voiceEdge] = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, animation.id)).limit(1);
  if (!voiceEdge || voiceEdge.inputRevisionId !== voiceContext.voice.id || voiceContext.voice.id !== snapshot.voiceRevisionId) throw new PermanentJobError("Voice đầu vào animation đã đổi sau khi chuẩn bị render");
  const script = voiceContext.script;
  if (script.id !== snapshot.scriptRevisionId || script.id !== workflow.acceptedScriptId) throw new PermanentJobError("Script đầu vào animation chưa được duyệt hoặc snapshot đã stale");
  const animationCheck = checkAnimation(parsed.data, voiceContext.timeline);
  if (animationCheck.errors.length) throw new PermanentJobError(`Animation không hợp lệ: ${animationCheck.errors[0]}`);
  const requests = await db.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, script.id));
  const assetEntries = requests.map((request) => ({ temporaryKey: request.temporaryKey, assetId: request.assetId, state: request.state })).sort((a, b) => a.temporaryKey.localeCompare(b.temporaryKey));
  const voiceEntries = voiceContext.timeline.scenes.flatMap((scene) => scene.cues.map((cue) => ({ cueId: cue.cueId, fingerprint: voiceContext.clips.find((clip) => clip.cueId === cue.cueId)!.fingerprint })));
  const manifest = { assets: assetEntries, voice: voiceEntries };
  if (canonicalJson(manifest) !== canonicalJson(snapshot.assetManifest) || canonicalJson(manifest) !== canonicalJson(output.assetManifest)) throw new PermanentJobError("Asset hoặc voice manifest đã thay đổi sau khi chuẩn bị render");
  for (const item of assetEntries) {
    if (!item.assetId || !item.state || !snapshot.assetManifest?.assets.some((entry) => entry.temporaryKey === item.temporaryKey && entry.assetId === item.assetId && entry.state === item.state)) throw new PermanentJobError("Asset manifest thiếu binding");
    const [approved] = await db.select({ assetId: assets.id }).from(assets).innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
      .where(and(eq(assets.id, item.assetId), eq(assets.seriesId, video.seriesId), eq(assets.status, "approved"), eq(assetVariants.state, item.state), eq(assetVariants.status, "approved"))).limit(1);
    if (!approved) throw new PermanentJobError("Asset không còn approved trong series của design");
  }

  const [freshWorkflowBeforeRender] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
  if (!freshWorkflowBeforeRender || freshWorkflowBeforeRender.acceptedAnimationId !== animation.id || freshWorkflowBeforeRender.acceptedScriptId !== script.id || freshWorkflowBeforeRender.activeOutputId !== output.id) throw new PermanentJobError("Render inputs changed before rendering");

  const stageDir = dataPath(`tmp/algorithm-render-${output.id}`);
  await mkdir(stageDir, { recursive: true });
  try {
    await db.update(algorithmOutputs).set({ status: "generating", error: null }).where(eq(algorithmOutputs.id, output.id));
    await mkdir(path.join(stageDir, "public", "voice"), { recursive: true });
    const audio = buildAudioCues(voiceContext.timeline, (_cueId, order) => `voice/cue-${order}.wav`);
    let cueNumber = 0;
    for (const scene of voiceContext.timeline.scenes) {
      for (const cue of scene.cues) {
        const clip = voiceContext.clips.find((item) => item.cueId === cue.cueId)!;
        await copyFile(dataPath(clip.filePath!), path.join(stageDir, "public", `voice/cue-${cueNumber}.wav`));
        cueNumber += 1;
      }
    }
    // Ảnh asset đã gắn chép vào publicDir tạm như voice; composition vẽ chúng ở sân khấu của từng cảnh.
    await mkdir(path.join(stageDir, "public", "assets"), { recursive: true });
    const bindings = await loadBoundAssetFiles(script.id, db);
    const assetFiles = new Map<string, string>();
    for (const binding of bindings) {
      if (assetFiles.has(binding.filePath)) continue;
      const target = `assets/asset-${assetFiles.size}.png`;
      await copyFile(dataPath(binding.filePath), path.join(stageDir, "public", target));
      assetFiles.set(binding.filePath, target);
    }
    const sceneAssets = buildSceneAssets(voiceContext.scriptContent, bindings,(filePath) => assetFiles.get(filePath)!);
    const captions = buildCaptions(voiceContext.timeline, voiceContext.scriptContent);
    const cues = buildCueWindows(voiceContext.timeline);
    const entryPoint = path.resolve("src/remotion/algorithm/entry.tsx");
    // Bundle của Remotion là webpack riêng, không đọc tsconfig paths: khai báo alias `@` -> src (composition import mã dùng chung như simulateScene).
    const serveUrl = await bundle({
      entryPoint,
      publicDir: path.join(stageDir, "public"),
      webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve("src") } } }),
    });
    const inputProps = { animation: parsed.data, audio, captions, cues, sceneAssets };
    const composition = await selectComposition({ serveUrl, id: "AlgorithmVideo", inputProps });
    const tmpFile = path.join(stageDir, "video.mp4");
    let lastLock = 0;
    await ensureBrowser();
    await renderMedia({
      composition, serveUrl, codec: "h264", outputLocation: tmpFile, inputProps,
      chromiumOptions: { enableMultiProcessOnLinux: true }, licenseKey: "free-license",
      onProgress: () => {
        const now = Date.now();
        if (now - lastLock >= LOCK_EVERY_MS) { lastLock = now; void ctx.extendLock(LOCK_SECONDS).catch(() => undefined); }
      },
    });
    const [freshWorkflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, run.videoId)).limit(1);
    if (!freshWorkflow || freshWorkflow.acceptedAnimationId !== animation.id || freshWorkflow.activeOutputId !== output.id || freshWorkflow.acceptedScriptId !== script.id) {
      await db.update(algorithmOutputs).set({ status: "stale", error: "Render inputs changed while render was running" }).where(eq(algorithmOutputs.id, output.id));
      await db.update(algorithmGenerationRuns).set({ status: "stale" }).where(eq(algorithmGenerationRuns.id, run.id));
      return { stale: true };
    }
    const filePath = `renders/algorithm-${output.id}.mp4`;
    const finalPath = dataPath(filePath);
    await mkdir(path.dirname(finalPath), { recursive: true });
    await rename(tmpFile, finalPath);
    if (composition.durationInFrames !== output.durationFrames || output.rendererVersion !== REMOTION_VERSION) throw new PermanentJobError("Output snapshot frame count/renderer không khớp composition");
    await db.update(algorithmOutputs).set({ filePath, status: "pending_review" }).where(eq(algorithmOutputs.id, output.id));
    await db.update(algorithmGenerationRuns).set({ status: "waiting_review" }).where(eq(algorithmGenerationRuns.id, run.id));
    return { outputId: output.id, filePath, frames: composition.durationInFrames, fps: composition.fps };
  } catch (error) {
    const message = errorText(error);
    if (ctx.attempt >= 3 || error instanceof PermanentJobError) {
      await db.update(algorithmOutputs).set({ status: "failed", error: message }).where(eq(algorithmOutputs.id, output.id));
      await db.update(algorithmGenerationRuns).set({ status: "failed", error: message }).where(eq(algorithmGenerationRuns.id, run.id));
    }
    throw error;
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

export async function renderAlgorithmVideo(payload: JobPayload, ctx: JobContext) {
  try {
    return await renderAlgorithmVideoInternal(payload, ctx);
  } catch (error) {
    // Các kiểm tra đầu job nằm ngoài khối try bên trong: lỗi vĩnh viễn ở đó phải đánh dấu output/run thất bại, nếu không output kẹt ở "generating" và không render lại được.
    if (error instanceof PermanentJobError) {
      const db = getDb();
      const message = errorText(error);
      const outputId = typeof payload.outputId === "string" ? payload.outputId : "";
      const runId = typeof payload.generationRunId === "string" ? payload.generationRunId : "";
      if (outputId) await db.update(algorithmOutputs).set({ status: "failed", error: message }).where(and(eq(algorithmOutputs.id, outputId), eq(algorithmOutputs.status, "generating")));
      if (runId) await db.update(algorithmGenerationRuns).set({ status: "failed", error: message }).where(eq(algorithmGenerationRuns.id, runId));
    }
    throw error;
  }
}
