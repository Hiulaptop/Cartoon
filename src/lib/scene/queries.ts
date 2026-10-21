import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { jobRuns, reviews, scenes, scripts, validations, videos } from "@/lib/db/schema";

export type SceneRow = typeof scenes.$inferSelect;
export type ValidationRow = typeof validations.$inferSelect;

export async function latestApprovedScript(videoId: string) {
  const [row] = await getDb()
    .select()
    .from(scripts)
    .where(and(eq(scripts.videoId, videoId), eq(scripts.status, "approved")))
    .orderBy(desc(scripts.version))
    .limit(1);
  return row ?? null;
}

// Có job scenes.generate chưa xong cho kịch bản này không.
export async function storyboardJobRunning(scriptId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: jobRuns.id })
    .from(jobRuns)
    .where(and(eq(jobRuns.jobType, "scenes.generate"), eq(jobRuns.targetId, scriptId), inArray(jobRuns.status, ["queued", "running"])))
    .limit(1);
  return rows.length > 0;
}

export async function getStoryboard(videoId: string) {
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return null;
  const script = await latestApprovedScript(videoId);
  if (!script) return { video, script: null, rows: [], checks: new Map<string, ValidationRow[]>(), running: false };
  const rows = await db.select().from(scenes).where(eq(scenes.scriptId, script.id)).orderBy(asc(scenes.position));
  const checks = new Map<string, ValidationRow[]>();
  if (rows.length) {
    const all = await db
      .select()
      .from(validations)
      .where(and(eq(validations.targetType, "scene"), inArray(validations.targetId, rows.map((r) => r.id))))
      .orderBy(asc(validations.createdAt));
    for (const v of all) checks.set(v.targetId, [...(checks.get(v.targetId) ?? []), v]);
  }
  return { video, script, rows, checks, running: await storyboardJobRunning(script.id) };
}

// Tỉ lệ giám khảo đồng thuận với người (spec §6): chỉ tính bản chấm cuối của giám khảo cho cảnh đã có quyết định người.
export async function agreementRate(): Promise<{ agree: number; total: number }> {
  const db = getDb();
  const judged = await db
    .select()
    .from(validations)
    .where(eq(validations.targetType, "scene"))
    .orderBy(asc(validations.createdAt));
  const lastJudge = new Map<string, ValidationRow>();
  for (const v of judged) {
    const stage = (v.scores as { stage?: string }).stage;
    if (stage === "judge") lastJudge.set(v.targetId, v);
  }
  if (lastJudge.size === 0) return { agree: 0, total: 0 };
  const decisions = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.targetType, "scene"), inArray(reviews.targetId, [...lastJudge.keys()])));
  let agree = 0;
  for (const d of decisions) {
    const j = lastJudge.get(d.targetId);
    if (j && ((j.verdict === "pass" && d.decision === "approved") || (j.verdict === "fail" && d.decision === "rejected"))) agree++;
  }
  return { agree, total: decisions.length };
}
