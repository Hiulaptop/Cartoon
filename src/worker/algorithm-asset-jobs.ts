import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests } from "@/lib/db/schema";
import type { JobPayload } from "@/lib/queue/jobs";

import { generateBase } from "./asset-jobs";
import { PermanentJobError, type JobContext } from "./job-types";

export async function generateAlgorithmAssetBase(payload: JobPayload, ctx: JobContext) {
  const requestId = typeof payload.requestId === "string" ? payload.requestId : "";
  const assetId = typeof payload.assetId === "string" ? payload.assetId : "";
  if (!requestId || !assetId) throw new PermanentJobError("Payload thiếu requestId/assetId");
  const db = getDb();
  try {
    const [request] = await db.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.id, requestId)).limit(1);
    if (!request || request.status !== "generating" || request.videoId !== payload.videoId || request.assetId !== null) throw new PermanentJobError("Asset request không còn khớp design");
    const metrics = await generateBase(payload);
    const [stillCurrent] = await db.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.id, requestId)).limit(1);
    if (!stillCurrent || stillCurrent.status !== "generating" || stillCurrent.videoId !== payload.videoId || stillCurrent.assetId !== null) {
      throw new PermanentJobError("Asset request đã đổi trong lúc worker sinh ảnh");
    }
    const [published] = await db.update(algorithmAssetRequests).set({ assetId, state: "base", status: "pending_review" })
      .where(and(eq(algorithmAssetRequests.id, requestId), eq(algorithmAssetRequests.status, "generating"), eq(algorithmAssetRequests.videoId, payload.videoId)))
      .returning({ id: algorithmAssetRequests.id });
    if (!published) throw new PermanentJobError("Asset request đổi trạng thái trước khi publish ảnh");
    return metrics;
  } catch (error) {
    if (ctx.attempt >= 3) {
      await db.update(algorithmAssetRequests).set({ status: "failed", reason: error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000) }).where(eq(algorithmAssetRequests.id, requestId));
    }
    throw error;
  }
}
