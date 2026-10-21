"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { FormState } from "@/lib/form";
import { getDb } from "@/lib/db/client";
import { reviews, scripts, videos } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { ensureDefaultCombo } from "@/lib/script/combo";
import { scriptContentSchema, type ScriptContent } from "@/lib/script/schema";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

// Tạo phiên bản kịch bản mới (generating) và đẩy job. Dùng cho tạo video, loại kèm lý do, sinh lại.
async function startScriptVersion(videoId: string, meta: ScriptContent["meta"]) {
  const db = getDb();
  const [last] = await db.select({ version: scripts.version }).from(scripts).where(eq(scripts.videoId, videoId)).orderBy(desc(scripts.version)).limit(1);
  const [created] = await db
    .insert(scripts)
    .values({ videoId, version: (last?.version ?? 0) + 1, status: "generating", content: { meta } })
    .returning({ id: scripts.id });
  await enqueueJob("script.generate", { scriptId: created.id }, { type: "script", id: created.id });
}

export async function createVideo(_prev: FormState, form: FormData): Promise<FormState> {
  const title = text(form, "title");
  const brief = text(form, "brief");
  const targetSeconds = Number(text(form, "targetSeconds"));
  const assetNames = form.getAll("assetNames").filter((v): v is string => typeof v === "string");
  if (title.length < 3) return { error: "Tiêu đề ít nhất 3 ký tự" };
  if (!Number.isInteger(targetSeconds) || targetSeconds < 30 || targetSeconds > 600) return { error: "Thời lượng 30–600 giây" };
  // Tạm: form mới (có bộ phim và project) làm ở Task 4 của plan series-project-design.
  const seriesId = text(form, "seriesId");
  const projectId = text(form, "projectId");
  if (!seriesId || !projectId) return { error: "Thiếu bộ phim hoặc project" };
  const catalog = await loadApprovedCatalog(seriesId);
  const chosen = assetNames.filter((n) => catalog.has(n));
  if (!chosen.some((n) => catalog.get(n)?.kind === "chr")) return { error: "Chọn ít nhất 1 nhân vật đã duyệt" };
  if (!chosen.some((n) => catalog.get(n)?.kind === "bg")) return { error: "Chọn ít nhất 1 bối cảnh đã duyệt" };

  const combo = await ensureDefaultCombo();
  const [video] = await getDb().insert(videos).values({ title, brief, comboId: combo.id, seriesId, projectId }).returning({ id: videos.id });
  await startScriptVersion(video.id, { assetNames: chosen, targetSeconds });
  revalidatePath("/videos");
  redirect(`/videos/${video.id}`);
}

async function loadScript(scriptId: string) {
  const [row] = await getDb().select().from(scripts).where(eq(scripts.id, scriptId)).limit(1);
  const content = row ? scriptContentSchema.safeParse(row.content) : null;
  return row && content?.success ? { row, content: content.data } : null;
}

export async function approveScript(_prev: FormState, form: FormData): Promise<FormState> {
  const found = await loadScript(text(form, "scriptId"));
  if (!found || found.row.status !== "pending_review") return { error: "Kịch bản không ở trạng thái chờ duyệt" };
  const db = getDb();
  await db.update(scripts).set({ status: "approved" }).where(eq(scripts.id, found.row.id));
  await db.update(videos).set({ status: "storyboarding" }).where(eq(videos.id, found.row.videoId));
  await db.insert(reviews).values({ targetType: "script", targetId: found.row.id, decision: "approved" });
  revalidatePath(`/videos/${found.row.videoId}`);
  return {};
}

export async function rejectScript(_prev: FormState, form: FormData): Promise<FormState> {
  const reason = text(form, "reason");
  if (reason.length < 5) return { error: "Ghi lý do loại (ít nhất 5 ký tự): lý do được đưa vào lần viết sau" };
  const found = await loadScript(text(form, "scriptId"));
  if (!found || !["pending_review", "failed"].includes(found.row.status)) return { error: "Kịch bản không thể loại ở trạng thái này" };
  const db = getDb();
  await db.update(scripts).set({ status: "rejected" }).where(eq(scripts.id, found.row.id));
  await db.insert(reviews).values({ targetType: "script", targetId: found.row.id, decision: "rejected", reason });
  await startScriptVersion(found.row.videoId, { ...found.content.meta, feedback: reason });
  revalidatePath(`/videos/${found.row.videoId}`);
  return {};
}

// Kịch bản `failed` (hết lượt sửa lớp 1): viết lại phiên bản mới, không cần lý do của người.
export async function regenerateScript(_prev: FormState, form: FormData): Promise<FormState> {
  const found = await loadScript(text(form, "scriptId"));
  if (!found || found.row.status !== "failed") return { error: "Chỉ sinh lại được kịch bản bị lỗi" };
  await startScriptVersion(found.row.videoId, { ...found.content.meta, feedback: undefined });
  revalidatePath(`/videos/${found.row.videoId}`);
  return {};
}
