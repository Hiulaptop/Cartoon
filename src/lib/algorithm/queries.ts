import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmDecisions, algorithmGenerationRuns, algorithmOutputs, algorithmRevisionInputs, algorithmRevisions, algorithmVoiceClips, algorithmWorkflows, assetVariants, assets, jobRuns, videos } from "@/lib/db/schema";

export async function getAlgorithmWorkflow(videoId: string) {
  const db = getDb();
  const [found] = await db.select({ video: videos, workflow: algorithmWorkflows })
    .from(videos)
    .innerJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id))
    .where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
  if (!found) return null;
  const revisions = await db.select().from(algorithmRevisions)
    .where(eq(algorithmRevisions.videoId, videoId)).orderBy(desc(algorithmRevisions.stage), desc(algorithmRevisions.version));
  const decisions = await db.select().from(algorithmDecisions).where(eq(algorithmDecisions.videoId, videoId)).orderBy(desc(algorithmDecisions.createdAt));
  const inputs = revisions.length ? await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.videoId, videoId)) : [];
  const generationRuns = await db.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.videoId, videoId)).orderBy(desc(algorithmGenerationRuns.createdAt));
  const assetRequests = revisions.length ? await db.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.videoId, videoId)) : [];
  const assetJobRuns = assetRequests.length ? await db.select().from(jobRuns).where(and(eq(jobRuns.jobType, "algorithm.asset.generate"), eq(jobRuns.targetId, videoId))).orderBy(desc(jobRuns.createdAt)) : [];
  const outputs = await db.select().from(algorithmOutputs).where(eq(algorithmOutputs.videoId, videoId)).orderBy(desc(algorithmOutputs.createdAt));
  const voiceClips = await db.select().from(algorithmVoiceClips).where(eq(algorithmVoiceClips.videoId, videoId));
  const catalog = await db.select({ seriesId: assets.seriesId, assetId: assets.id, name: assets.name, displayName: assets.displayName, kind: assets.kind, variantId: assetVariants.id, state: assetVariants.state, filePath: assetVariants.filePath })
    .from(assets).innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
    .where(and(eq(assets.seriesId, found.video.seriesId), eq(assets.status, "approved"), eq(assetVariants.status, "approved")));
  // Trạng thái ảnh của từng request (đang sinh, chờ duyệt, lỗi) để bước kịch bản hiện kết quả gán tự động.
  const requestAssetIds = [...new Set(assetRequests.flatMap((request) => (request.assetId ? [request.assetId] : [])))];
  const requestVariants = requestAssetIds.length
    ? await db.select({ assetId: assetVariants.assetId, state: assetVariants.state, status: assetVariants.status, filePath: assetVariants.filePath, assetName: assets.name })
      .from(assetVariants).innerJoin(assets, eq(assets.id, assetVariants.assetId)).where(inArray(assetVariants.assetId, requestAssetIds))
    : [];
  return { ...found, revisions, decisions, inputs, generationRuns, assetRequests, assetJobRuns, outputs, voiceClips, catalog, requestVariants };
}
