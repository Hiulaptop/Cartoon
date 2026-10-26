import { createReadStream } from "node:fs";
import { and, eq, gte } from "drizzle-orm";
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { renders, uploads, videos } from "@/lib/db/schema";
import { extractJson } from "@/lib/llm/json";
import { chat, requireModel } from "@/lib/ninerouter/client";
import type { JobPayload } from "@/lib/queue/jobs";
import { scriptContentSchema } from "@/lib/script/schema";
import { scripts } from "@/lib/db/schema";
import { dataPath } from "@/lib/storage";
import { classifyYoutubeError, youtubeClient } from "@/lib/youtube/client";
import { validateMetadata, type UploadMetadata } from "@/lib/youtube/metadata";

import { DeferredJobError, PermanentJobError } from "./job-types";

const DAILY_UPLOAD_LIMIT = 90; // hạn mức chính thức 100/ngày/project; chừa dư
const DEFER_SECONDS = 3600;

// Metadata lưu trong `uploads` chưa có cột riêng: nằm ở job payload và ở bản ghi uploads.error khi lỗi.
// Bước 7: upload bản render đã duyệt. `uploads` do app tạo sẵn (queued) cùng metadata trong payload.
export async function uploadYoutube(payload: JobPayload) {
  const uploadId = typeof payload.uploadId === "string" ? payload.uploadId : "";
  const meta = payload.metadata as UploadMetadata | undefined;
  if (!uploadId || !meta) throw new PermanentJobError('Payload thiếu "uploadId" hoặc "metadata"');
  const db = getDb();
  const [upload] = await db.select().from(uploads).where(eq(uploads.id, uploadId)).limit(1);
  if (!upload) throw new PermanentJobError(`Không có upload ${uploadId}`);
  if (upload.status === "succeeded") return { youtubeVideoId: upload.youtubeVideoId, alreadyDone: true };

  const issues = validateMetadata(meta);
  if (issues.length) throw new PermanentJobError(`Metadata không hợp lệ: ${issues.join("; ")}`);
  if (upload.madeForKids) throw new PermanentJobError("made_for_kids phải là false (spec §2)");

  const [video] = await db.select().from(videos).where(eq(videos.id, upload.videoId)).limit(1);
  const [render] = await db.select().from(renders).where(and(eq(renders.videoId, upload.videoId), eq(renders.status, "approved"))).limit(1);
  if (!video || video.kind !== "cartoon" || video.status !== "uploading" || !render?.filePath) throw new PermanentJobError("Video chưa có bản render đã duyệt");

  // Giữ hạn mức ngày bằng cửa sổ trượt 24 giờ (quyết định 3).
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(uploads).where(and(eq(uploads.status, "succeeded"), gte(uploads.updatedAt, since)));
  if (n >= DAILY_UPLOAD_LIMIT) throw new DeferredJobError(DEFER_SECONDS, `Đã upload ${n} video trong 24 giờ qua; hẹn lại sau 1 giờ`);

  // Thiếu cấu hình OAuth là lỗi cố định, không thử lại.
  let yt: ReturnType<typeof youtubeClient>;
  try {
    yt = youtubeClient();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(uploads).set({ status: "failed", error: message }).where(eq(uploads.id, uploadId));
    throw new PermanentJobError(message);
  }

  await db.update(uploads).set({ status: "running", attempts: upload.attempts + 1, error: null }).where(eq(uploads.id, uploadId));
  try {
    const res = await yt.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: meta.categoryId },
        status: {
          privacyStatus: upload.privacyStatus, // luôn gửi tường minh: bỏ trống thì YouTube mặc định public
          selfDeclaredMadeForKids: false,
          containsSyntheticMedia: false, // hoạt hình phi thực tế không phải khai báo (tra 2026-10-21)
        },
      },
      media: { mimeType: "video/mp4", body: createReadStream(dataPath(render.filePath)) },
    });
    const youtubeVideoId = res.data.id;
    if (!youtubeVideoId) throw new Error("YouTube không trả về id video");
    await db.update(uploads).set({ status: "succeeded", youtubeVideoId, error: null }).where(eq(uploads.id, uploadId));
    await db.update(videos).set({ status: "done" }).where(eq(videos.id, upload.videoId));
    return { youtubeVideoId, privacyStatus: upload.privacyStatus };
  } catch (error) {
    const c = classifyYoutubeError(error);
    await db.update(uploads).set({ status: c.kind === "quota" ? "queued" : "failed", error: c.message }).where(eq(uploads.id, uploadId));
    if (c.kind === "quota") throw new DeferredJobError(DEFER_SECONDS, c.message);
    if (c.kind === "auth" || c.kind === "invalid") throw new PermanentJobError(c.message);
    throw error;
  }
}

// Gợi ý tiêu đề, mô tả, tag từ kịch bản đã duyệt. Chỉ trả gợi ý trong job metrics; người dùng sửa rồi mới upload.
export async function suggestMetadata(payload: JobPayload) {
  const videoId = typeof payload.videoId === "string" ? payload.videoId : "";
  if (!videoId) throw new PermanentJobError('Payload thiếu "videoId"');
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  const [script] = await db.select().from(scripts).where(and(eq(scripts.videoId, videoId), eq(scripts.status, "approved"))).limit(1);
  const content = script && scriptContentSchema.safeParse(script.content);
  if (!video || video.kind !== "cartoon" || !content?.success || !content.data.script) throw new PermanentJobError("Video chưa có kịch bản đã duyệt");
  const s = content.data.script;

  const res = await chat({
    model: requireModel("LLM_WRITER_MODEL"),
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "You write YouTube metadata for a teen cartoon episode (audience 14-18, English). Reply with ONLY JSON: " +
          '{"title": string (<=70 chars, no < or >), "description": string (<=1500 chars, no < or >), "tags": string[] (<=12, each <=30 chars)}. ' +
          "No misleading claims, no clickbait about content not in the episode.",
      },
      { role: "user", content: `Title: ${s.title}\nLogline: ${s.logline}\nBeats: ${s.beats.map((b) => b.summary).join(" | ")}` },
    ],
  });
  const raw = extractJson(res.content) as Partial<UploadMetadata>;
  const suggestion: UploadMetadata = {
    title: String(raw.title ?? s.title).replace(/[<>]/g, "").slice(0, 100),
    description: String(raw.description ?? s.logline).replace(/[<>]/g, ""),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).replace(/[<>]/g, "")).slice(0, 12) : [],
    categoryId: "1",
  };
  return { suggestion, model: res.model, usage: res.usage };
}
