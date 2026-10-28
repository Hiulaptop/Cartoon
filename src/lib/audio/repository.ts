import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { audioTakes, voiceoverTimelines, videos, reviews } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";
import { loadRenderInput, type AudioDb } from "@/lib/render/input";
import { timelineHash, visualFingerprint } from "./fingerprint";
import { verifyAudioSource } from "./files";
import { validateVoiceover } from "./schema";
import type { AudioSourceMeta } from "./types";

export type AudioTake = typeof audioTakes.$inferSelect;
export function takeMeta(take: AudioTake): AudioSourceMeta {
  if (!take.filePath || !take.sha256 || !take.bytes || !take.durationSeconds || !take.sampleRate || !take.channels || !take.codec) throw new Error("Bản thu chưa có file hợp lệ");
  return { filePath: take.filePath, sha256: take.sha256, bytes: take.bytes, durationSeconds: take.durationSeconds, sampleRate: take.sampleRate, channels: take.channels, codec: take.codec };
}
export async function latestTimeline(videoId: string, db: AudioDb = getDb()) {
  const [row] = await db.select().from(voiceoverTimelines).where(eq(voiceoverTimelines.videoId, videoId)).orderBy(desc(voiceoverTimelines.version)).limit(1);
  return row ?? null;
}
export async function approvedSources(videoId: string, db: AudioDb = getDb(), verify = false) {
  const takes = await db.select().from(audioTakes).where(and(eq(audioTakes.videoId, videoId), eq(audioTakes.status, "approved")));
  const entries = await Promise.all(takes.map(async (take) => { const meta = takeMeta(take); if (verify) await verifyAudioSource(meta); return [take.id, meta] as const; }));
  return Object.fromEntries(entries);
}
export async function lockVideo(videoId: string, db: AudioDb) {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).for("update");
  if (!video) throw new Error("Không có design");
  return video;
}
type TakeInput = { videoId: string; requestId: string; label: string; speakerRef?: string };
export async function createUploadTake(input: TakeInput & { sha256: string; bytes: number }) {
  return getDb().transaction(async (tx) => {
    await lockVideo(input.videoId, tx);
    const [existing] = await tx.select().from(audioTakes).where(eq(audioTakes.requestId, input.requestId));
    if (existing) {
      if (existing.videoId !== input.videoId || existing.source !== "upload" || existing.sha256 !== input.sha256) throw new Error("Request ID đã dùng cho nội dung khác");
      return { take: existing, created: false };
    }
    const [take] = await tx.insert(audioTakes).values({ ...input, source: "upload", status: "generating" }).returning();
    return { take, created: true };
  });
}
export async function createTtsTake(input: TakeInput & { text: string; modelMetadata: { modelId: string; label: string } }) {
  return getDb().transaction(async (tx) => {
    await lockVideo(input.videoId, tx);
    const [existing] = await tx.select().from(audioTakes).where(eq(audioTakes.requestId, input.requestId));
    if (existing) {
      if (existing.videoId !== input.videoId || existing.source !== "tts" || existing.text !== input.text || existing.modelMetadata?.modelId !== input.modelMetadata.modelId) throw new Error("Request ID đã dùng cho nội dung khác");
      return existing;
    }
    const [take] = await tx.insert(audioTakes).values({ ...input, source: "tts", status: "generating" }).returning();
    await enqueueJob("audio.generate", { takeId: take.id }, { type: "audio_take", id: take.id }, tx);
    return take;
  });
}
export async function reviewTake(videoId: string, takeId: string, decision: "approved" | "rejected", reason = "") {
  return getDb().transaction(async (tx) => {
    await lockVideo(videoId, tx);
    const [take] = await tx.select().from(audioTakes).where(and(eq(audioTakes.id, takeId), eq(audioTakes.videoId, videoId))).for("update");
    if (!take || take.status !== "pending_review") throw new Error("Bản thu không ở trạng thái chờ duyệt");
    if (decision === "approved") await verifyAudioSource(takeMeta(take));
    if (decision === "rejected" && reason.trim().length < 5) throw new Error("Lý do loại cần ít nhất 5 ký tự");
    await tx.update(audioTakes).set({ status: decision }).where(eq(audioTakes.id, takeId));
    await tx.insert(reviews).values({ targetType: "audio_take", targetId: takeId, decision, reason });
  });
}
export async function saveTimelineVersion(videoId: string, content: unknown, expectedLatestVersionId: string | null) {
  return getDb().transaction(async (tx) => {
    await lockVideo(videoId, tx);
    const latest = await latestTimeline(videoId, tx);
    if ((latest?.id ?? null) !== expectedLatestVersionId) throw new Error("Timeline đã thay đổi; tải lại để chỉnh bản mới nhất");
    const input = await loadRenderInput(videoId, tx);
    const checked = validateVoiceover(content, await approvedSources(videoId, tx), input.visual.scenes.reduce((n, s) => n + s.durationFrames, 0));
    if (!checked.ok) throw new Error(checked.issues.join("; "));
    if (checked.timeline.visualFingerprint !== visualFingerprint(input.visual)) throw new Error("Cảnh đã đổi; kiểm tra timeline rồi xác nhận bối cảnh mới");
    const [saved] = await tx.insert(voiceoverTimelines).values({ videoId, version: (latest?.version ?? 0) + 1, content: checked.timeline, visualFingerprint: checked.timeline.visualFingerprint, contentHash: timelineHash(checked.timeline), status: "draft" }).returning();
    return saved;
  });
}
export async function reviewTimeline(videoId: string, timelineId: string, decision: "approved" | "rejected", reason = "") {
  return getDb().transaction(async (tx) => {
    await lockVideo(videoId, tx);
    const row = await latestTimeline(videoId, tx);
    if (!row || row.id !== timelineId || !["draft", "pending_review"].includes(row.status)) throw new Error("Chỉ duyệt/loại bản nháp timeline mới nhất");
    if (decision === "approved") {
      const input = await loadRenderInput(videoId, tx);
      const checked = validateVoiceover(row.content, await approvedSources(videoId, tx, true), input.visual.scenes.reduce((sum, s) => sum + s.durationFrames, 0));
      if (!checked.ok || row.visualFingerprint !== visualFingerprint(input.visual) || timelineHash(row.content) !== row.contentHash) throw new Error("Timeline sai hoặc đã cũ; lưu lại sau khi kiểm tra cảnh/bản thu");
    } else if (reason.trim().length < 5) throw new Error("Lý do loại cần ít nhất 5 ký tự");
    await tx.update(voiceoverTimelines).set({ status: decision }).where(and(eq(voiceoverTimelines.id, timelineId), inArray(voiceoverTimelines.status, ["draft", "pending_review"])));
    await tx.insert(reviews).values({ targetType: "voiceover_timeline", targetId: timelineId, decision, reason });
  });
}
