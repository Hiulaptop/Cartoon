import { copyFile, mkdir, rename, rm, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { jobRuns, renders, scenes, scripts, videos } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import type { JobPayload } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import { parseSceneDsl, FPS, type ResolvedAssets } from "@/lib/scene/schema";
import { dataPath, writeDataFile } from "@/lib/storage";
import { readRenderRequest, snapshotRenderAudio } from "@/lib/audio/render-snapshot";
import { objectHash, sha256, visualFingerprint } from "@/lib/audio/fingerprint";
import type { RenderRequestV1, VisualSnapshot } from "@/lib/audio/types";
import type { VideoProps } from "@/remotion/VideoComposition";

import { PermanentJobError, type JobContext } from "./job-types";

const LOCK_SECONDS = 120;
const LOCK_EVERY_MS = 15_000;
const PROGRESS_EVERY_MS = 2_000;

// Bước 6: render các cảnh đã duyệt thành một MP4. `renders` do app tạo sẵn (idempotent theo renderId).
export async function renderVideo(payload: JobPayload, ctx: JobContext) {
  const renderId = typeof payload.renderId === "string" ? payload.renderId : "";
  if (!renderId) throw new PermanentJobError('Payload thiếu "renderId"');
  const db = getDb();
  const [render] = await db.select().from(renders).where(eq(renders.id, renderId)).limit(1);
  if (!render) throw new PermanentJobError(`Không có render ${renderId}`);
  const [video] = await db.select().from(videos).where(eq(videos.id, render.videoId)).limit(1);
  if (!video || video.kind !== "cartoon") throw new PermanentJobError("Không có video hoạt hình của bản render này");

  const stage = dataPath(`tmp/render-${renderId}`);
  const completed = ["pending_review", "approved", "rejected"].includes(render.status) && !!render.filePath;
  try {
    let request: RenderRequestV1 | undefined;
    if (Object.hasOwn(payload, "requestVersion") || Object.hasOwn(payload, "requestHash")) {
      if (payload.requestVersion !== 1 || typeof payload.requestHash !== "string") throw new PermanentJobError("Render request version/hash không hợp lệ");
      try { request = await readRenderRequest(renderId, payload.requestHash, render.videoId, false); }
      catch { throw new PermanentJobError("Input render đã đổi hoặc không hợp lệ; kiểm tra timeline và tạo render mới"); }
      if (render.voiceoverSnapshotHash !== payload.requestHash || render.voiceoverTimelineId !== (request.audio.mode === "voiceover" ? request.audio.timelineVersionId : null)) throw new PermanentJobError("Render record không khớp request");
      if (completed && render.filePath) {
        const manifest = JSON.parse(await readFile(dataPath(`renders/${renderId}/manifest.json`), "utf8"));
        if (manifest.requestHash === payload.requestHash && objectHash(manifest.request) === payload.requestHash && sha256(await readFile(dataPath(render.filePath))) === manifest.outputHash) return { reused: true, renderId };
        throw new PermanentJobError("Output render trước đây không khớp manifest");
      }
      try { await readRenderRequest(renderId, payload.requestHash, render.videoId); }
      catch { throw new PermanentJobError("Input render đã đổi hoặc không hợp lệ; kiểm tra timeline và tạo render mới"); }
    } else if (render.voiceoverSnapshotHash || render.voiceoverTimelineId) throw new PermanentJobError("Thiếu payload request của bản render mới");
    await db.update(renders).set({ status: "generating", error: null }).where(eq(renders.id, renderId));

    // 1. Cảnh đã duyệt của kịch bản duyệt mới nhất, đủ và đúng thứ tự.
    const [script] = await db
      .select()
      .from(scripts)
      .where(and(eq(scripts.videoId, render.videoId), eq(scripts.status, "approved")))
      .orderBy(desc(scripts.version))
      .limit(1);
    if (!script) throw new PermanentJobError("Video chưa có kịch bản đã duyệt");
    const rows = await db.select().from(scenes).where(eq(scenes.scriptId, script.id)).orderBy(asc(scenes.position));
    if (rows.length === 0 || rows.some((r) => r.status !== "approved")) {
      throw new PermanentJobError("Chưa duyệt đủ mọi cảnh");
    }

    // 2. Kiểm lại từng cảnh với danh mục hiện tại (asset có thể đã đổi sau khi duyệt).
    const catalog = await loadApprovedCatalog(video.seriesId);
    const sceneProps: VideoProps["scenes"] = [];
    const used = new Set<string>();
    for (const row of rows) {
      const parsed = parseSceneDsl(row.dsl);
      if (!parsed.ok) throw new PermanentJobError(`Cảnh ${row.position}: JSON sai khuôn: ${parsed.issues[0]}`);
      const checked = checkSceneDsl(parsed.dsl, catalog);
      if (checked.issues.length) throw new PermanentJobError(`Cảnh ${row.position}: ${checked.issues[0]}`);
      sceneProps.push({ dsl: parsed.dsl, assets: checked.assets });
      for (const a of Object.values(checked.assets as ResolvedAssets)) used.add(a.path);
    }

    if (request) {
      const actual: VisualSnapshot = { scriptId: script.id, scriptVersion: script.version, scriptHash: objectHash(script.content), fps: 30, width: 1920, height: 1080, scenes: rows.map((row, i) => ({ id: row.id, position: row.position, dslHash: objectHash(sceneProps[i].dsl), durationFrames: sceneProps[i].dsl.durationFrames })) };
      if (visualFingerprint(actual) !== request.visualHash || objectHash([...used].sort()) !== objectHash(request.imageFiles.map((i) => i.path).sort())) throw new PermanentJobError("Cảnh/asset đã đổi trước snapshot");
    }

    // 3. Thư mục public tạm chỉ chứa ảnh được dùng; staticFile(path) khớp đường dẫn tính từ DATA_DIR.
    const publicDir = path.join(stage, "public");
    for (const rel of used) {
      const target = path.join(publicDir, rel);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(dataPath(rel), target);
      if (request && sha256(await readFile(target)) !== request.imageFiles.find((i) => i.path === rel)?.sha256) throw new PermanentJobError("Ảnh snapshot hash không khớp request");
    }
    const voiceover = request ? await snapshotRenderAudio(request, publicDir) : undefined;

    // 4. Bundle + render.
    await ensureBrowser();
    const serveUrl = await bundle({
      entryPoint: path.resolve("src/remotion/index.ts"),
      publicDir,
      // Bundle của Remotion là webpack riêng, không đọc tsconfig paths: khai báo alias `@` -> src.
      webpackOverride: (config) => ({
        ...config,
        resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve("src") } },
      }),
    });
    const inputProps: VideoProps = { scenes: sceneProps, assetMode: "static", ...(voiceover ? { voiceover } : {}) };
    const composition = await selectComposition({ serveUrl, id: "Video", inputProps });

    const out = path.join(stage, "out.mp4");
    let lastLock = 0;
    let lastProgress = 0;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      ...(voiceover ? { audioCodec: "aac" as const } : {}),
      outputLocation: out,
      inputProps,
      chromiumOptions: { enableMultiProcessOnLinux: true },
      // Người dùng xác nhận (2026-10-21) đủ điều kiện free license Remotion: tối đa 3 người vận hành (spec §13).
      licenseKey: "free-license",
      onProgress: ({ progress }) => {
        const now = Date.now();
        if (now - lastLock > LOCK_EVERY_MS) {
          lastLock = now;
          void ctx.extendLock(LOCK_SECONDS).catch(() => undefined);
        }
        if (now - lastProgress > PROGRESS_EVERY_MS) {
          lastProgress = now;
          void db.update(jobRuns).set({ metrics: { progress: Number(progress.toFixed(3)) } }).where(eq(jobRuns.id, ctx.jobRunId)).catch(() => undefined);
        }
      },
    });

    // 5. Đưa file vào chỗ cuối (cùng ổ đĩa: đổi tên nguyên tử).
    const finalRel = `renders/${renderId}.mp4`;
    await mkdir(path.dirname(dataPath(finalRel)), { recursive: true });
    await rename(out, dataPath(finalRel));
    const durationMs = Math.round((composition.durationInFrames / FPS) * 1000);
    const sourceHashes: Record<string, string> = {};
    async function recordSources(dir: string) {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await recordSources(file);
        else if (/\.(ts|tsx)$/.test(entry.name)) sourceHashes[file.replaceAll(path.sep, "/")] = sha256(await readFile(file));
      }
    }
    await recordSources("src/remotion");
    for (const file of ["src/lib/audio/timing.ts", "src/lib/audio/types.ts", "src/lib/scene/schema.ts"]) sourceHashes[file] = sha256(await readFile(file));
    const packages = JSON.parse(await readFile("package.json", "utf8"));
    await writeDataFile(`renders/${renderId}/manifest.json`, JSON.stringify({ version: 1, renderId, request: request ?? null, requestHash: request ? payload.requestHash : null, mode: request?.audio.mode ?? "legacy-silent", sourceHashes, lockHash: sha256(await readFile("package-lock.json")), packages: packages.dependencies, imageSnapshots: request?.imageFiles ?? [...used].sort(), audioSnapshots: request?.audio.mode === "voiceover" ? request.audio.takeHashes : {}, frames: composition.durationInFrames, fps: FPS, durationMs, outputHash: sha256(await readFile(dataPath(finalRel))) }, null, 2));
    await db.update(renders).set({ filePath: finalRel, durationMs, status: "pending_review" }).where(eq(renders.id, renderId));
    return { scenes: rows.length, frames: composition.durationInFrames, durationMs };
  } catch (error) {
    // A redelivered queue message must never downgrade a completed, reviewed artifact.
    if (!completed) await db.update(renders).set({ status: "failed", error: errorMessage(error) }).where(eq(renders.id, renderId));
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
