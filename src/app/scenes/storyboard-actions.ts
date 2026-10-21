"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { FormState } from "@/lib/form";
import { getDb } from "@/lib/db/client";
import { reviews, scenes, videos } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";
import { latestApprovedScript, storyboardJobRunning } from "@/lib/scene/queries";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export async function startStoryboard(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const script = await latestApprovedScript(videoId);
  if (!script) return { error: "Video chưa có kịch bản đã duyệt" };
  if (await storyboardJobRunning(script.id)) return { error: "Đang có job phân cảnh chạy cho kịch bản này" };
  await enqueueJob("scenes.generate", { scriptId: script.id }, { type: "script", id: script.id });
  revalidatePath(`/scenes/${videoId}`);
  return {};
}

async function loadScene(sceneId: string) {
  const [row] = await getDb().select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  return row ?? null;
}

// Khi mọi cảnh của kịch bản đã duyệt thì video sang bước render.
async function advanceIfAllApproved(videoId: string, scriptId: string) {
  const db = getDb();
  const rows = await db.select({ status: scenes.status }).from(scenes).where(eq(scenes.scriptId, scriptId));
  if (rows.length > 0 && rows.every((r) => r.status === "approved")) {
    await db.update(videos).set({ status: "rendering" }).where(eq(videos.id, videoId));
  }
}

export async function approveScene(_prev: FormState, form: FormData): Promise<FormState> {
  const scene = await loadScene(text(form, "sceneId"));
  if (!scene || scene.status !== "pending_review") return { error: "Cảnh không ở trạng thái chờ duyệt" };
  const db = getDb();
  await db.update(scenes).set({ status: "approved" }).where(eq(scenes.id, scene.id));
  await db.insert(reviews).values({ targetType: "scene", targetId: scene.id, decision: "approved" });
  await advanceIfAllApproved(scene.videoId, scene.scriptId);
  revalidatePath(`/scenes/${scene.videoId}`);
  return {};
}

export async function approveAllScenes(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const script = await latestApprovedScript(videoId);
  if (!script) return { error: "Video chưa có kịch bản đã duyệt" };
  const db = getDb();
  const pending = await db.select().from(scenes).where(and(eq(scenes.scriptId, script.id), eq(scenes.status, "pending_review")));
  for (const s of pending) {
    await db.update(scenes).set({ status: "approved" }).where(eq(scenes.id, s.id));
    await db.insert(reviews).values({ targetType: "scene", targetId: s.id, decision: "approved" });
  }
  await advanceIfAllApproved(videoId, script.id);
  revalidatePath(`/scenes/${videoId}`);
  return {};
}

// Loại cảnh kèm lý do, hoặc sinh lại cảnh `failed` (không cần lý do): đẩy job viết lại đúng vị trí đó.
export async function rejectScene(_prev: FormState, form: FormData): Promise<FormState> {
  const scene = await loadScene(text(form, "sceneId"));
  if (!scene) return { error: "Không có cảnh này" };
  const failed = scene.status === "failed";
  const reason = text(form, "reason");
  if (!failed && reason.length < 5) return { error: "Ghi lý do loại (ít nhất 5 ký tự): lý do được đưa vào lần viết lại" };
  if (!failed && scene.status !== "pending_review") return { error: "Cảnh không thể loại ở trạng thái này" };
  if (await storyboardJobRunning(scene.scriptId)) return { error: "Đang có job phân cảnh chạy cho kịch bản này" };
  const db = getDb();
  if (!failed) {
    await db.update(scenes).set({ status: "rejected" }).where(eq(scenes.id, scene.id));
    await db.insert(reviews).values({ targetType: "scene", targetId: scene.id, decision: "rejected", reason });
  }
  await enqueueJob(
    "scenes.generate",
    { scriptId: scene.scriptId, positions: [scene.position], humanFeedback: reason ? { [scene.position]: reason } : {} },
    { type: "script", id: scene.scriptId },
  );
  revalidatePath(`/scenes/${scene.videoId}`);
  return {};
}
