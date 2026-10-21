import { copyFile, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";
import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { jobRuns, renders, scenes, scripts } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import type { JobPayload } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import { parseSceneDsl, FPS, type ResolvedAssets } from "@/lib/scene/schema";
import { dataPath } from "@/lib/storage";
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

  const stage = dataPath(`tmp/render-${renderId}`);
  try {
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
    const catalog = await loadApprovedCatalog();
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

    // 3. Thư mục public tạm chỉ chứa ảnh được dùng; staticFile(path) khớp đường dẫn tính từ DATA_DIR.
    const publicDir = path.join(stage, "public");
    for (const rel of used) {
      const target = path.join(publicDir, rel);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(dataPath(rel), target);
    }

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
    const inputProps: VideoProps = { scenes: sceneProps, assetMode: "static" };
    const composition = await selectComposition({ serveUrl, id: "Video", inputProps });

    const out = path.join(stage, "out.mp4");
    let lastLock = 0;
    let lastProgress = 0;
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: out,
      inputProps,
      chromiumOptions: { enableMultiProcessOnLinux: true },
      // licenseKey: chỉ thêm `licenseKey: "free-license"` sau khi người dùng xác nhận đủ điều kiện (xem plan M6).
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
    await db.update(renders).set({ filePath: finalRel, durationMs, status: "pending_review" }).where(eq(renders.id, renderId));
    return { scenes: rows.length, frames: composition.durationInFrames, durationMs };
  } catch (error) {
    await db.update(renders).set({ status: "failed", error: errorMessage(error) }).where(eq(renders.id, renderId));
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
