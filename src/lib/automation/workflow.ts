import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { automationProfiles as profiles, automationVideos as videos, automationRevisions as revisions, automationReviews as reviews, automationOutputs as outputs, automationRuns as runs, automationSources as sources } from "@/lib/db/schema";
import { enqueueJobInTransaction, type JobType } from "@/lib/queue/jobs";
import { BriefSchema, BundleSchema, DEFAULT_PROFILE, FileSchema, PermitSchema, ProfileSchema, ResearchSchema, StoryboardSchema, type Brief, type ExpectedHead, type Permit, type Profile, type RunStage } from "./contracts";
import { canonicalHash, sha256 } from "./fingerprint";
import { checkVisuals } from "./visual";
import { checkResearch, checkStoryboard } from "./checks";
import { readDataFile } from "@/lib/storage";

export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export async function getProfile() {
  const [row] = await getDb().select().from(profiles).where(eq(profiles.key, 1));
  return { version: row?.version ?? 0, config: row ? ProfileSchema.parse(row.config) : DEFAULT_PROFILE };
}
export async function saveProfile(config: Profile, version: number) {
  const parsed = ProfileSchema.parse(config);
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(814037)`);
    const [old] = await tx.select().from(profiles).where(eq(profiles.key, 1)).for("update");
    if ((old?.version ?? 0) !== version) throw new Error("Hồ sơ đã đổi. Tải lại trang.");
    await tx.insert(profiles).values({ key: 1, config: parsed }).onConflictDoUpdate({ target: profiles.key, set: { config: parsed, version: version + 1 } });
  });
}
export async function createVideo(brief: Brief) {
  const profile = await getProfile();
  const [row] = await getDb().insert(videos).values({ brief: BriefSchema.parse(brief), profileSnapshot: profile.config }).returning();
  return row.id;
}
export async function listVideos() {
  return getDb().select().from(videos).orderBy(sql`CASE WHEN ${videos.archived} THEN 4 WHEN ${videos.state} IN ('waiting_review','blocked','failed') THEN 0 WHEN ${videos.state} IN ('queued','running') THEN 1 WHEN ${videos.stage} = 'complete' THEN 3 ELSE 2 END`, desc(videos.updatedAt)).limit(100);
}
export async function getWorkspace(id: string) {
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, id));
  if (!video) return null;
  const [revisionRows, reviewRows, outputRows, runRows, sourceRows] = await Promise.all([
    db.select().from(revisions).where(eq(revisions.videoId, id)).orderBy(desc(revisions.createdAt)),
    db.select().from(reviews).where(eq(reviews.videoId, id)).orderBy(desc(reviews.createdAt)),
    db.select().from(outputs).where(eq(outputs.videoId, id)).orderBy(desc(outputs.createdAt)),
    db.select().from(runs).where(eq(runs.videoId, id)).orderBy(desc(runs.createdAt)),
    db.select().from(sources).where(eq(sources.videoId, id)),
  ]);
  return { video, revisions: revisionRows, reviews: reviewRows, outputs: outputRows, runs: runRows, sources: sourceRows };
}
export type Workspace = NonNullable<Awaited<ReturnType<typeof getWorkspace>>>;
export type VideoRow = typeof videos.$inferSelect;
export async function lockVideo(tx: DbTx, expected: ExpectedHead) {
  const [video] = await tx.select().from(videos).where(eq(videos.id, expected.videoId)).for("update");
  if (!video || video.archived) throw new Error("Video không tồn tại hoặc đã lưu trữ");
  if (video.lockVersion !== expected.lockVersion) throw new Error("Phiên bản đã đổi. Tải lại trang trước khi quyết định.");
  return video;
}
export async function isApproved(tx: DbTx, videoId: string, gate: number, subjectId: string, hash: string) {
  const [review] = await tx.select().from(reviews).where(and(eq(reviews.videoId, videoId), eq(reviews.gate, gate), gate === 3 ? eq(reviews.outputId, subjectId) : eq(reviews.revisionId, subjectId))).orderBy(desc(reviews.createdAt)).limit(1);
  return review?.decision === "approved" && review.subjectHash === hash;
}
async function assertNoActiveRun(tx: DbTx, videoId: string) {
  const active = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.videoId, videoId), sql`${runs.status} IN ('queued','running')`)).limit(1);
  if (active.length) throw new Error("Có lượt chạy đang hoạt động; chờ kết thúc trước khi đổi quyết định hoặc ghi giờ.");
}
export async function startStage(expected: ExpectedHead, stage: RunStage, permit: Permit, durationException = "", editorial?: { title: string; description: string; thumbnailTitle: string }) {
  if (durationException.length > 1000) throw new Error("Lý do ngoại lệ thời lượng tối đa 1000 ký tự");
  const overrides = editorial ? z.strictObject({ title: z.string().max(100), description: z.string().max(5000), thumbnailTitle: z.string().max(200) }).parse(editorial) : undefined;
  PermitSchema.parse(permit);
  if (process.env.AUTOMATION_EXECUTION_ENABLED !== "true") throw new Error("Automation chưa bật thực thi. Có thể lưu và duyệt bản nháp.");
  return getDb().transaction(async (tx) => {
    const video = await lockVideo(tx, expected);
    const profile = ProfileSchema.parse(video.profileSnapshot);
    if (!profile.accessConfirmed || !profile.licensesConfirmed || !profile.model || !profile.voice) throw new Error("Cần cấu hình model/voice, xác nhận quyền sử dụng và bảo vệ truy cập trước khi chạy.");
    if (profile.runLimit <= 0 || profile.videoLimit <= 0 || profile.monthlyLimit <= 0) throw new Error("Cần cấu hình ngân sách dương trước khi chạy.");
    const active = await tx.select().from(runs).where(and(eq(runs.videoId, video.id), sql`${runs.status} IN ('queued','running')`));
    if (active.length) throw new Error("Video đang có một lượt chạy. Không tạo lượt trùng.");
    const revisionId = stage === "research" ? null : stage === "storyboard" ? video.researchId : video.storyboardId;
    if (stage !== "research") {
      const [research] = video.researchId ? await tx.select().from(revisions).where(eq(revisions.id, video.researchId)) : [];
      if (!research || research.videoId !== video.id || research.kind !== "research" || research.stale || !await isApproved(tx, video.id, 1, research.id, research.hash)) throw new Error("Nghiên cứu hiện hành chưa được duyệt.");
    }
    if (["audio", "render"].includes(stage)) {
      const [story] = video.storyboardId ? await tx.select().from(revisions).where(eq(revisions.id, video.storyboardId)) : [];
      if (!story || story.videoId !== video.id || story.kind !== "storyboard" || story.stale || !await isApproved(tx, video.id, 2, story.id, story.hash)) throw new Error("Storyboard hiện hành chưa được duyệt.");
    }
    if (stage === "preview" && !video.storyboardId) throw new Error("Chưa có storyboard");
    if (stage === "research" && video.researchId) throw new Error("Yêu cầu sửa brief trước khi sinh lại nghiên cứu.");
    if (stage === "storyboard" && video.storyboardId) throw new Error("Yêu cầu sửa trước khi sinh lại storyboard.");
    if (stage === "package") {
      const [final] = video.outputId ? await tx.select().from(outputs).where(and(eq(outputs.id, video.outputId), eq(outputs.videoId, video.id))) : [];
      if (!final?.hash || final.status !== "ready" || !await isApproved(tx, video.id, 3, final.id, final.hash)) throw new Error("Bản cuối chưa được duyệt");
    }
    const [lastRun] = await tx.select({ inputSnapshot: runs.inputSnapshot }).from(runs).where(and(eq(runs.videoId, video.id), eq(runs.stage, stage), sql`${runs.inputSnapshot}->'expected'->>'lockVersion' = ${String(video.lockVersion)}`)).orderBy(desc(runs.createdAt)).limit(1);
    const priorFeedback = (lastRun?.inputSnapshot as { feedback?: string | null } | undefined)?.feedback;
    const runId = randomUUID();
    const snapshot = { expected, brief: video.brief, profile, researchId: video.researchId, storyboardId: video.storyboardId, revisionId, ...(stage === "render" && overrides ? { editorial: overrides } : {}), durationException: stage === "render" ? durationException.trim() : "", feedback: priorFeedback !== undefined ? priorFeedback : video.error, profileHash: canonicalHash(profile) };
    await tx.insert(runs).values({ id: runId, videoId: video.id, stage, requestKey: canonicalHash({ stage, snapshot }), inputSnapshot: snapshot, permit });
    const jobId = await enqueueJobInTransaction(tx, `automation.${stage}` as JobType, { automationRunId: runId }, { type: "automation_video", id: video.id });
    await tx.update(runs).set({ jobRunId: jobId }).where(eq(runs.id, runId));
    await tx.update(videos).set({ state: "queued" }).where(eq(videos.id, video.id));
    return runId;
  });
}
export async function approve(expected: ExpectedHead, gate: number, note: string) {
  await getDb().transaction(async (tx) => {
    const video = await lockVideo(tx, expected);
    await assertNoActiveRun(tx, video.id);
    if (gate !== 1 && gate !== 2 && gate !== 3) throw new Error("Cổng duyệt không hợp lệ");
    const id = gate === 1 ? video.researchId : gate === 2 ? video.storyboardId : video.outputId;
    if (!id) throw new Error("Chưa có bản để duyệt");
    if (gate === 3) {
      const [output] = await tx.select().from(outputs).where(and(eq(outputs.id, id), eq(outputs.videoId, video.id)));
      if (!output || output.status !== "ready" || output.kind !== "render" || canonicalHash(output.manifest) !== output.hash) throw new Error("Bản cuối không hợp lệ");
      const bundle = BundleSchema.parse(output.manifest);
      if (bundle.storyboardId !== video.storyboardId) throw new Error("Storyboard của bản cuối đã cũ");
      const [story] = await tx.select().from(revisions).where(and(eq(revisions.id, bundle.storyboardId), eq(revisions.videoId, video.id)));
      if (!story || story.stale || bundle.storyboardHash !== story.hash || !await isApproved(tx, video.id, 2, story.id, story.hash)) throw new Error("Storyboard đầu vào chưa duyệt hoặc đã đổi");
      await (await import("./files")).verifyFiles(bundle.files);
      await tx.insert(reviews).values({ videoId: video.id, gate, outputId: id, subjectHash: output.hash!, decision: "approved", note });
      await tx.update(videos).set({ lockVersion: video.lockVersion + 1, state: "idle", error: null }).where(eq(videos.id, video.id));
      return;
    }
    const [revision] = await tx.select().from(revisions).where(and(eq(revisions.id, id), eq(revisions.videoId, video.id)));
    if (!revision || revision.stale || revision.kind !== (gate === 1 ? "research" : "storyboard") || canonicalHash(revision.content) !== revision.hash) throw new Error("Bản duyệt đã cũ hoặc hash không hợp lệ");
    if (gate === 1) {
      const sourceRows = await tx.select().from(sources).where(eq(sources.videoId, video.id));
      const evidence = await Promise.all(sourceRows.map(async (source) => {
        const bytes = await readDataFile(source.filePath);
        if (sha256(bytes) !== source.hash) throw new Error("Snapshot nguồn bị đổi");
        return { id: source.id, hash: source.hash, text: bytes.toString("utf8") };
      }));
      const errors = checkResearch(ResearchSchema.parse(revision.content), evidence);
      if (errors.length) throw new Error(errors[0].message);
    } else {
      const [research] = video.researchId ? await tx.select().from(revisions).where(eq(revisions.id, video.researchId)) : [];
      if (!research || !await isApproved(tx, video.id, 1, research.id, research.hash)) throw new Error("Nghiên cứu chưa duyệt");
      const parsed = StoryboardSchema.parse(revision.content);
      const errors = [...checkStoryboard(parsed, ResearchSchema.parse(research.content)), ...checkVisuals(parsed)];
      if (errors.length) throw new Error(errors[0].message);
      const [preview] = video.previewId ? await tx.select().from(outputs).where(eq(outputs.id, video.previewId)) : [];
      if (!preview || preview.videoId !== video.id || preview.status !== "ready" || canonicalHash(preview.manifest) !== preview.hash || (preview.inputSnapshot as { storyboardHash?: string }).storyboardHash !== revision.hash) throw new Error("Cần preview hiện hành hợp lệ trước khi duyệt");
      const manifest = z.object({ durationFrames: z.number().int().min(450).max(900), files: z.array(FileSchema).min(1) }).parse(preview.manifest);
      await (await import("./files")).verifyFiles(manifest.files);
    }
    await tx.insert(reviews).values({ videoId: video.id, gate, revisionId: id, subjectHash: revision.hash, decision: "approved", note });
    await tx.update(videos).set({ lockVersion: video.lockVersion + 1, state: "idle", stage: gate === 1 ? "storyboard" : "production", error: null }).where(eq(videos.id, video.id));
  });
}
export async function revise(expected: ExpectedHead, brief: Brief | null, feedback: string) {
  if (!feedback.trim()) throw new Error("Cần nêu nội dung muốn sửa");
  await getDb().transaction(async (tx) => {
    const video = await lockVideo(tx, expected);
    const researchChange = !!brief;
    const subjectId = researchChange ? video.researchId : video.storyboardId;
    if (subjectId) {
      const [subject] = await tx.select().from(revisions).where(and(eq(revisions.id, subjectId), eq(revisions.videoId, video.id)));
      if (subject) await tx.insert(reviews).values({ videoId: video.id, gate: researchChange ? 1 : 2, revisionId: subject.id, subjectHash: subject.hash, decision: "rejected", note: feedback.slice(0, 2000) });
    }
    await tx.update(revisions).set({ stale: true }).where(and(eq(revisions.videoId, video.id), researchChange ? sql`true` : eq(revisions.kind, "storyboard")));
    await tx.update(outputs).set({ status: "stale" }).where(eq(outputs.videoId, video.id));
    await tx.update(runs).set({ status: "stale" }).where(and(eq(runs.videoId, video.id), sql`${runs.status} IN ('queued','running')`));
    await tx.update(videos).set({ ...(brief ? { brief: BriefSchema.parse(brief), researchId: null } : {}), storyboardId: null, previewId: null, outputId: null, stage: researchChange ? "research" : "storyboard", state: "idle", error: feedback.slice(0, 2000), lockVersion: video.lockVersion + 1 }).where(eq(videos.id, video.id));
  });
}
export async function editStoryboard(expected: ExpectedHead, input: { sceneId: string; cueId?: string; text?: string; spokenText?: string; preview?: boolean }) {
  await getDb().transaction(async (tx) => {
    const video = await lockVideo(tx, expected);
    const [current] = video.storyboardId ? await tx.select().from(revisions).where(and(eq(revisions.id, video.storyboardId), eq(revisions.videoId, video.id))) : [];
    const [research] = video.researchId ? await tx.select().from(revisions).where(and(eq(revisions.id, video.researchId), eq(revisions.videoId, video.id))) : [];
    if (!current || current.stale || !research || research.stale || !await isApproved(tx, video.id, 1, research.id, research.hash)) throw new Error("Cần storyboard và research hiện hành đã duyệt");
    const storyboard = StoryboardSchema.parse(current.content);
    const scene = storyboard.scenes.find((item) => item.id === input.sceneId);
    if (!scene) throw new Error("Không tìm thấy cảnh");
    if (input.preview) storyboard.previewSceneId = scene.id;
    else {
      const cue = scene.cues.find((item) => item.id === input.cueId);
      if (!cue) throw new Error("Không tìm thấy cue");
      cue.text = input.text ?? cue.text;
      cue.spokenText = input.spokenText ?? cue.spokenText;
    }
    const parsed = StoryboardSchema.parse(storyboard);
    const issues = [...checkStoryboard(parsed, ResearchSchema.parse(research.content)), ...checkVisuals(parsed)];
    if (issues.length) throw new Error(issues[0].message);
    const [latest] = await tx.select().from(revisions).where(and(eq(revisions.videoId, video.id), eq(revisions.kind, "storyboard"))).orderBy(desc(revisions.sequence)).limit(1);
    const [revision] = await tx.insert(revisions).values({ videoId: video.id, kind: "storyboard", sequence: (latest?.sequence ?? 0) + 1, parentId: current.id, content: parsed, hash: canonicalHash(parsed), inputSnapshot: { researchId: research.id, researchHash: research.hash, profileHash: canonicalHash(video.profileSnapshot) } }).returning();
    await tx.update(revisions).set({ stale: true }).where(eq(revisions.id, current.id));
    await tx.update(outputs).set({ status: "stale" }).where(eq(outputs.videoId, video.id));
    await tx.update(runs).set({ status: "stale" }).where(and(eq(runs.videoId, video.id), sql`${runs.status} IN ('queued','running')`));
    await tx.update(videos).set({ storyboardId: revision.id, previewId: null, outputId: null, stage: "storyboard", state: "waiting_review", error: null, lockVersion: video.lockVersion + 1 }).where(eq(videos.id, video.id));
  });
}
export async function applyProfile(expected: ExpectedHead) {
  await getDb().transaction(async (tx) => {
    const video = await lockVideo(tx, expected);
    await assertNoActiveRun(tx, video.id);
    const [profile] = await tx.select().from(profiles).where(eq(profiles.key, 1));
    if (!profile) throw new Error("Chưa có hồ sơ kênh");
    const config = ProfileSchema.parse(profile.config);
    await tx.update(revisions).set({ stale: true }).where(eq(revisions.videoId, video.id));
    await tx.update(outputs).set({ status: "stale" }).where(eq(outputs.videoId, video.id));
    await tx.update(videos).set({ profileSnapshot: config, researchId: null, storyboardId: null, previewId: null, outputId: null, stage: "research", state: "idle", error: null, lockVersion: video.lockVersion + 1 }).where(eq(videos.id, video.id));
  });
}
export async function archive(expected: ExpectedHead) {
  await getDb().transaction(async (tx) => {
    const video = await lockVideo(tx, expected);
    await tx.update(runs).set({ status: "stale" }).where(and(eq(runs.videoId, video.id), sql`${runs.status} IN ('queued','running')`));
    await tx.update(videos).set({ archived: true, lockVersion: video.lockVersion + 1 }).where(eq(videos.id, video.id));
  });
}
export async function addWork(expected: ExpectedHead, minutes: number, note: string) {
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error("Số phút từ 1 đến 1440");
  await getDb().transaction(async (tx) => {
    const video = await lockVideo(tx, expected);
    await assertNoActiveRun(tx, video.id);
    const log = Array.isArray(video.workLog) ? video.workLog : [];
    await tx.update(videos).set({ workLog: [...log, { minutes, note: note.slice(0, 500), at: new Date().toISOString() }], lockVersion: video.lockVersion + 1 }).where(eq(videos.id, video.id));
  });
}
