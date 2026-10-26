import { desc, eq, gte } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmGenerationRuns, algorithmOutputs, jobRuns, videos } from "@/lib/db/schema";
import { isDesignActive, type ActivityEvent, type DesignActivity, type RunActivity } from "@/lib/algorithm/activity-types";

export async function getDesignActivity(videoId: string): Promise<DesignActivity> {
  const db = getDb();
  const rows = await db
    .select({
      id: algorithmGenerationRuns.id,
      stage: algorithmGenerationRuns.stage,
      status: algorithmGenerationRuns.status,
      updatedAt: algorithmGenerationRuns.updatedAt,
      runError: algorithmGenerationRuns.error,
      attempts: jobRuns.attempts,
      startedAt: jobRuns.startedAt,
      jobError: jobRuns.error,
    })
    .from(algorithmGenerationRuns)
    .leftJoin(jobRuns, eq(algorithmGenerationRuns.jobRunId, jobRuns.id))
    .where(eq(algorithmGenerationRuns.videoId, videoId))
    .orderBy(desc(algorithmGenerationRuns.createdAt))
    .limit(20);
  const runs: RunActivity[] = rows.map((row) => ({
    id: row.id,
    stage: row.stage,
    status: row.status,
    attempts: row.attempts ?? 0,
    startedAt: row.startedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    error: row.runError ?? row.jobError ?? null,
  }));
  const [output] = await db
    .select({ id: algorithmOutputs.id, status: algorithmOutputs.status, updatedAt: algorithmOutputs.updatedAt, error: algorithmOutputs.error })
    .from(algorithmOutputs)
    .where(eq(algorithmOutputs.videoId, videoId))
    .orderBy(desc(algorithmOutputs.createdAt))
    .limit(1);
  const assetRequests = await db
    .select({ id: algorithmAssetRequests.id, status: algorithmAssetRequests.status })
    .from(algorithmAssetRequests)
    .where(eq(algorithmAssetRequests.videoId, videoId));
  const base = {
    serverTime: new Date().toISOString(),
    runs,
    output: output ? { id: output.id, status: output.status, updatedAt: output.updatedAt.toISOString(), error: output.error } : null,
    assetRequests,
  };
  return { ...base, active: isDesignActive(base) };
}

export async function getRecentActivity(hours = 24): Promise<ActivityEvent[]> {
  const db = getDb();
  const since = new Date(Date.now() - hours * 3_600_000);
  const runRows = await db
    .select({ id: algorithmGenerationRuns.id, designId: algorithmGenerationRuns.videoId, title: videos.title, stage: algorithmGenerationRuns.stage, status: algorithmGenerationRuns.status, at: algorithmGenerationRuns.updatedAt })
    .from(algorithmGenerationRuns)
    .innerJoin(videos, eq(videos.id, algorithmGenerationRuns.videoId))
    .where(gte(algorithmGenerationRuns.updatedAt, since))
    .orderBy(desc(algorithmGenerationRuns.updatedAt))
    .limit(50);
  const outputRows = await db
    .select({ id: algorithmOutputs.id, designId: algorithmOutputs.videoId, title: videos.title, status: algorithmOutputs.status, at: algorithmOutputs.updatedAt })
    .from(algorithmOutputs)
    .innerJoin(videos, eq(videos.id, algorithmOutputs.videoId))
    .where(gte(algorithmOutputs.updatedAt, since))
    .orderBy(desc(algorithmOutputs.updatedAt))
    .limit(20);
  const events: ActivityEvent[] = [];
  for (const row of runRows) {
    const kind = row.status === "queued" || row.status === "running" ? "running" : row.status === "failed" ? "failed" : row.status === "stale" ? null : "ready";
    if (kind) events.push({ id: row.id, designId: row.designId, title: row.title, stage: row.stage, kind, at: row.at.toISOString() });
  }
  for (const row of outputRows) {
    const kind = row.status === "generating" ? "running" : row.status === "failed" ? "failed" : row.status === "pending_review" ? "ready" : null;
    if (kind) events.push({ id: row.id, designId: row.designId, title: row.title, stage: "render", kind, at: row.at.toISOString() });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
}
