"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form";
import { getDb } from "@/lib/db/client";
import { renders, reviews, videos } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export async function startRender(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video || video.status !== "rendering") return { error: "Video chưa sẵn sàng để render (cần duyệt đủ mọi cảnh)" };
  const existing = await db.select({ status: renders.status }).from(renders).where(eq(renders.videoId, videoId));
  if (existing.some((r) => r.status === "generating")) return { error: "Đang có bản render chạy" };
  const [render] = await db.insert(renders).values({ videoId, status: "generating" }).returning({ id: renders.id });
  await enqueueJob("video.render", { renderId: render.id }, { type: "render", id: render.id });
  revalidatePath(`/designs/${videoId}/render`);
  return {};
}

export async function approveRender(_prev: FormState, form: FormData): Promise<FormState> {
  const [render] = await getDb().select().from(renders).where(eq(renders.id, text(form, "renderId"))).limit(1);
  if (!render || render.status !== "pending_review") return { error: "Bản render không ở trạng thái chờ duyệt" };
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
  if (!render || render.status !== "pending_review") return { error: "Bản render không ở trạng thái chờ duyệt" };
  const db = getDb();
  await db.update(renders).set({ status: "rejected" }).where(eq(renders.id, render.id));
  await db.insert(reviews).values({ targetType: "render", targetId: render.id, decision: "rejected", reason });
  await db.update(videos).set({ status: "storyboarding" }).where(eq(videos.id, render.videoId));
  revalidatePath(`/designs/${render.videoId}/render`);
  return {};
}
