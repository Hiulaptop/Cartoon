"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form";
import { getDb } from "@/lib/db/client";
import { renders, reviews, videos } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";
import { getCartoonDesign } from "@/lib/video/queries";
import { prepareRenderRequest, storeRenderRequest } from "@/lib/audio/render-snapshot";
import { lockVideo } from "@/lib/audio/repository";
import { z } from "zod";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export async function startRender(_prev: FormState, form: FormData): Promise<FormState> {
  try {
  const videoId = text(form, "videoId");
  z.uuid().parse(videoId);
  const db = getDb();
  const mode = z.enum(["silent", "voiceover"]).parse(text(form, "audioMode"));
  await db.transaction(async (tx) => {
  const video = await lockVideo(videoId, tx);
  if (video.kind !== "cartoon" || video.status !== "rendering") throw new Error("Video chưa sẵn sàng để render (cần duyệt đủ mọi cảnh)");
  const existing = await tx.select({ status: renders.status }).from(renders).where(eq(renders.videoId, videoId));
  if (existing.some((r) => r.status === "generating")) throw new Error("Đang có bản render chạy");
  const selection = mode === "silent" ? { mode } : { mode, timelineVersionId: z.uuid().parse(text(form, "timelineVersionId")) };
  const request = await prepareRenderRequest(videoId, selection, tx);
  const requestHash = await storeRenderRequest(request);
  await tx.insert(renders).values({ id: request.renderId, videoId, status: "generating", voiceoverTimelineId: request.audio.mode === "voiceover" ? request.audio.timelineVersionId : null, voiceoverSnapshotHash: requestHash });
  await enqueueJob("video.render", { renderId: request.renderId, requestVersion: 1, requestHash }, { type: "render", id: request.renderId }, tx);
  });
  revalidatePath(`/designs/${videoId}/render`);
  return {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { error: /^(Timeline|Video chưa|Đang có|Cần duyệt|Cảnh|File audio|Chưa có)/.test(message) ? message : "Không thể xếp hàng render; chọn chế độ audio và kiểm tra dữ liệu/kết nối" };
  }
}

export async function approveRender(_prev: FormState, form: FormData): Promise<FormState> {
  const [render] = await getDb().select().from(renders).where(eq(renders.id, text(form, "renderId"))).limit(1);
  if (!render || render.status !== "pending_review" || !await getCartoonDesign(render.videoId)) return { error: "Bản render hoạt hình không ở trạng thái chờ duyệt" };
  const db = getDb();
  await db.update(renders).set({ status: "approved" }).where(eq(renders.id, render.id));
  await db.update(videos).set({ status: "uploading" }).where(eq(videos.id, render.videoId));
  await db.insert(reviews).values({ targetType: "render", targetId: render.id, decision: "approved" });
  revalidatePath(`/designs/${render.videoId}/render`);
  return {};
}

// Loại bản render: lỗi nằm ở cảnh, nên đưa video về bước phân cảnh để sửa rồi duyệt lại.
export async function rejectRender(_prev: FormState, form: FormData): Promise<FormState> {
  const reason = text(form, "reason");
  if (reason.length < 5) return { error: "Ghi lý do loại (ít nhất 5 ký tự)" };
  const [render] = await getDb().select().from(renders).where(eq(renders.id, text(form, "renderId"))).limit(1);
  if (!render || render.status !== "pending_review" || !await getCartoonDesign(render.videoId)) return { error: "Bản render hoạt hình không ở trạng thái chờ duyệt" };
  const db = getDb();
  await db.update(renders).set({ status: "rejected" }).where(eq(renders.id, render.id));
  await db.insert(reviews).values({ targetType: "render", targetId: render.id, decision: "rejected", reason });
  await db.update(videos).set({ status: "storyboarding" }).where(eq(videos.id, render.videoId));
  revalidatePath(`/designs/${render.videoId}/render`);
  return {};
}
