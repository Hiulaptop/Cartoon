"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/app/assets/actions";
import { getDb } from "@/lib/db/client";
import { channels, renders, uploads, videos } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";
import { validateMetadata } from "@/lib/youtube/metadata";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export async function suggest(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  await enqueueJob("upload.suggest_metadata", { videoId }, { type: "video", id: videoId });
  revalidatePath(`/upload/${videoId}`);
  return {};
}

export async function startUpload(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const privacy = text(form, "privacy");
  if (privacy !== "private" && privacy !== "unlisted" && privacy !== "public") return { error: "Chế độ riêng tư không hợp lệ" };
  if (privacy !== "private" && form.get("confirmPublic") !== "on") {
    return { error: "Tick ô xác nhận: video sẽ hiển thị ngoài chế độ riêng tư" };
  }
  const metadata = {
    title: text(form, "title"),
    description: text(form, "description"),
    tags: text(form, "tags").split(",").map((t) => t.trim()).filter(Boolean),
    categoryId: text(form, "categoryId"),
  };
  const issues = validateMetadata(metadata);
  if (issues.length) return { error: issues.join("; ") };

  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video || video.status !== "uploading") return { error: "Video chưa ở bước upload (cần duyệt bản render)" };
  const [render] = await db.select().from(renders).where(and(eq(renders.videoId, videoId), eq(renders.status, "approved"))).limit(1);
  if (!render) return { error: "Chưa có bản render đã duyệt" };
  const active = await db
    .select({ id: uploads.id })
    .from(uploads)
    .where(and(eq(uploads.videoId, videoId), inArray(uploads.status, ["queued", "running"])))
    .limit(1);
  if (active.length) return { error: "Đang có một lần upload chạy cho video này" };

  // Một kênh ở lát cắt đầu (quyết định 2 của plan M7): tạo hàng mặc định nếu chưa có.
  let [channel] = await db.select().from(channels).orderBy(desc(channels.createdAt)).limit(1);
  channel ??= (await db.insert(channels).values({ name: "default" }).returning())[0];

  const [upload] = await db
    .insert(uploads)
    .values({ videoId, channelId: channel.id, privacyStatus: privacy, madeForKids: false, status: "queued" })
    .returning({ id: uploads.id });
  await db.update(videos).set({ channelId: channel.id }).where(eq(videos.id, videoId));
  await enqueueJob("upload.youtube", { uploadId: upload.id, metadata }, { type: "upload", id: upload.id });
  revalidatePath(`/upload/${videoId}`);
  return {};
}
