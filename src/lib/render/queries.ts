import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { jobRuns, renders, videos } from "@/lib/db/schema";

export type RenderRow = typeof renders.$inferSelect;

export async function listRenderableVideos() {
  return getDb().select().from(videos).where(eq(videos.status, "rendering")).orderBy(desc(videos.createdAt));
}

// Các lần render của video (mới nhất trước), kèm tiến độ 0..1 của job đang chạy.
export async function getRenders(videoId: string) {
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return null;
  const rows = await db.select().from(renders).where(eq(renders.videoId, videoId)).orderBy(desc(renders.createdAt));
  const progress = new Map<string, number>();
  if (rows.length) {
    const jobs = await db
      .select()
      .from(jobRuns)
      .where(and(eq(jobRuns.jobType, "video.render"), inArray(jobRuns.targetId, rows.map((r) => r.id)), eq(jobRuns.status, "running")));
    for (const j of jobs) {
      const p = Number((j.metrics as { progress?: number } | null)?.progress ?? 0);
      if (j.targetId) progress.set(j.targetId, p);
    }
  }
  return { video, rows, progress };
}
