import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { automationRuns as runs, automationVideos as videos, automationRevisions as revisions, automationOutputs as outputs } from "@/lib/db/schema";
import { ProfileSchema, BriefSchema, type Profile, type Brief } from "@/lib/automation/contracts";
import { canonicalHash } from "@/lib/automation/fingerprint";
import type { JobContext } from "../job-types";
import { PermanentJobError } from "../job-types";

const SnapshotSchema = z.object({ expected: z.object({ videoId: z.uuid(), lockVersion: z.number().int().positive() }), researchId: z.uuid().nullable(), storyboardId: z.uuid().nullable(), profile: ProfileSchema, brief: BriefSchema, feedback: z.string().nullable().optional(), durationException: z.string().max(1000).optional(), editorial: z.strictObject({ title: z.string().max(100), description: z.string().max(5000), thumbnailTitle: z.string().max(200) }).optional() });
export type RunContext = { run: typeof runs.$inferSelect; video: typeof videos.$inferSelect; profile: Profile; brief: Brief; snapshot: z.infer<typeof SnapshotSchema> };
export async function loadRun(payload: Record<string, unknown>): Promise<RunContext> {
  if (typeof payload.automationRunId !== "string") throw new PermanentJobError("Thiếu automationRunId");
  const db = getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, payload.automationRunId));
  if (!run) throw new PermanentJobError("Automation run không tồn tại");
  const [video] = await db.select().from(videos).where(eq(videos.id, run.videoId));
  const snapshot = SnapshotSchema.parse(run.inputSnapshot);
  if (process.env.AUTOMATION_EXECUTION_ENABLED !== "true") throw new PermanentJobError("Automation chưa bật thực thi");
  if (!video || video.id !== snapshot.expected.videoId || video.archived || video.lockVersion !== snapshot.expected.lockVersion || !["queued", "running"].includes(run.status)) throw new PermanentJobError("Automation run đã cũ hoặc đã hoàn thành");
  return { run, video, snapshot, profile: ProfileSchema.parse(snapshot.profile), brief: BriefSchema.parse(snapshot.brief) };
}
export async function publishRevision(context: RunContext, kind: "research" | "storyboard", content: unknown, generation?: { model: string; usage: unknown }) {
  const db = getDb();
  return db.transaction(async (tx) => {
    const [video] = await tx.select().from(videos).where(eq(videos.id, context.video.id)).for("update");
    const [run] = await tx.select().from(runs).where(eq(runs.id, context.run.id)).for("update");
    if (!run || run.status !== "running") return;
    if (!video || video.archived || video.lockVersion !== context.snapshot.expected.lockVersion || video.researchId !== context.snapshot.researchId || video.storyboardId !== context.snapshot.storyboardId) { await tx.update(runs).set({ status: "stale" }).where(eq(runs.id, context.run.id)); return; }
    const [parent] = await tx.select().from(revisions).where(and(eq(revisions.videoId, video.id), eq(revisions.kind, kind))).orderBy(desc(revisions.sequence)).limit(1);
    const [revision] = await tx.insert(revisions).values({ videoId: video.id, kind, sequence: (parent?.sequence ?? 0) + 1, parentId: parent?.id ?? null, content, hash: canonicalHash(content), inputSnapshot: { ...context.snapshot, ...(generation ? { generation } : {}) } }).returning();
    await tx.update(videos).set({ ...(kind === "research" ? { researchId: revision.id } : { storyboardId: revision.id, previewId: null }), stage: kind, state: "waiting_review", lockVersion: video.lockVersion + 1, error: null }).where(eq(videos.id, video.id));
    await tx.update(runs).set({ status: "succeeded" }).where(eq(runs.id, context.run.id));
  });
}
export async function publishArtifact(context: RunContext, kind: "preview" | "audio" | "render" | "package", manifest: unknown, dependencies: Record<string, unknown>) {
  return getDb().transaction(async (tx) => {
    const [video] = await tx.select().from(videos).where(eq(videos.id, context.video.id)).for("update");
    const [run] = await tx.select().from(runs).where(eq(runs.id, context.run.id)).for("update");
    if (!run || run.status !== "running") throw new PermanentJobError("Lượt chạy không còn quyền publish");
    const stale = !video || video.archived || video.lockVersion !== context.snapshot.expected.lockVersion || video.researchId !== context.snapshot.researchId || video.storyboardId !== context.snapshot.storyboardId;
    const [output] = await tx.insert(outputs).values({ videoId: context.video.id, kind, status: stale ? "stale" : "ready", manifest, hash: canonicalHash(manifest), inputSnapshot: dependencies }).returning();
    if (!stale) await tx.update(videos).set({ ...(kind === "preview" ? { previewId: output.id } : kind === "render" ? { outputId: output.id, stage: "final" } : kind === "package" ? { stage: "complete" } : {}), state: kind === "render" ? "waiting_review" : "idle", lockVersion: video.lockVersion + 1, error: null }).where(eq(videos.id, video.id));
    await tx.update(runs).set({ status: stale ? "stale" : "succeeded" }).where(eq(runs.id, context.run.id));
    return output;
  });
}
export async function guardJob(payload: Record<string, unknown>, ctx: JobContext, work: (context: RunContext) => Promise<void>) {
  try {
    const context = await loadRun(payload);
    await getDb().transaction(async (tx) => {
      const [video] = await tx.select().from(videos).where(eq(videos.id, context.video.id)).for("update");
      const [run] = await tx.select().from(runs).where(eq(runs.id, context.run.id)).for("update");
      if (!video || video.archived || video.lockVersion !== context.snapshot.expected.lockVersion || run?.jobRunId !== ctx.jobRunId) throw new PermanentJobError("Job không thuộc lượt chạy hiện hành");
      if (run.status === "running") throw new PermanentJobError("Lượt chạy bị gián đoạn; cần kiểm tra ledger, không tự gửi lại request");
      if (run.status !== "queued") throw new PermanentJobError("Lượt chạy không còn queued");
      await tx.update(runs).set({ status: "running" }).where(eq(runs.id, run.id));
      await tx.update(videos).set({ state: "running" }).where(eq(videos.id, video.id));
    });
    await ctx.extendLock(300);
    await work(context);
    return { automationRunId: context.run.id };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 800) : "Automation thất bại";
    const runId = z.uuid().safeParse(payload.automationRunId);
    if (runId.success) await getDb().transaction(async (tx) => {
      const [owner] = await tx.select().from(runs).where(eq(runs.id, runId.data));
      if (!owner || owner.jobRunId !== ctx.jobRunId) return;
      const [video] = await tx.select().from(videos).where(eq(videos.id, owner.videoId)).for("update");
      const [run] = await tx.select().from(runs).where(eq(runs.id, owner.id)).for("update");
      if (!run || !["queued", "running"].includes(run.status)) return;
      const snapshot = SnapshotSchema.safeParse(run.inputSnapshot);
      const current = video && !video.archived && snapshot.success && video.lockVersion === snapshot.data.expected.lockVersion;
      await tx.update(runs).set({ status: current ? "blocked" : "stale", error: message }).where(eq(runs.id, run.id));
      if (current) await tx.update(videos).set({ state: "blocked", error: message }).where(eq(videos.id, video.id));
    });
    throw new PermanentJobError(message);
  }
}
