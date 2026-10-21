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

// Tạo phiên bản kịch bản mới (generating) và đẩy job. Dùng cho tạo design, loại kèm lý do, sinh lại.
async function startScriptVersion(videoId: string, meta: ScriptContent["meta"]) {
  const db = getDb();
  const [last] = await db.select({ version: scripts.version }).from(scripts).where(eq(scripts.videoId, videoId)).orderBy(desc(scripts.version)).limit(1);
  const [created] = await db
    .insert(scripts)
    .values({ videoId, version: (last?.version ?? 0) + 1, status: "generating", content: { meta } })
    .returning({ id: scripts.id });
  await enqueueJob("script.generate", { scriptId: created.id }, { type: "script", id: created.id });
}

const TARGET_RANGE = "Thời lượng 30–600 giây";

// Kiểm tra bộ asset chọn: ít nhất 1 nhân vật và 1 bối cảnh đã duyệt của bộ phim.
async function pickAssets(seriesId: string, names: string[]): Promise<{ chosen: string[] } | { error: string }> {
  const catalog = await loadApprovedCatalog(seriesId);
  const chosen = names.filter((n) => catalog.has(n));
  if (!chosen.some((n) => catalog.get(n)?.kind === "chr")) return { error: "Chọn ít nhất 1 nhân vật đã duyệt" };
  if (!chosen.some((n) => catalog.get(n)?.kind === "bg")) return { error: "Chọn ít nhất 1 bối cảnh đã duyệt" };
  return { chosen };
}

// Tạo design. Có `assetNames` thì viết kịch bản ngay; không có thì chỉ tạo design (chọn asset sau ở trang design).
export async function createDesign(_prev: FormState, form: FormData): Promise<FormState> {
  const projectId = text(form, "projectId");
  const seriesId = text(form, "seriesId");
  const title = text(form, "title");
  const brief = text(form, "brief");
  const targetSeconds = Number(text(form, "targetSeconds"));
  const assetNames = form.getAll("assetNames").filter((v): v is string => typeof v === "string");
  if (title.length < 3) return { error: "Tiêu đề ít nhất 3 ký tự" };
  if (!projectId) return { error: "Thiếu project" };
  if (!seriesId) return { error: "Chọn bộ phim" };
  if (!Number.isInteger(targetSeconds) || targetSeconds < 30 || targetSeconds > 600) return { error: TARGET_RANGE };
  const picked = assetNames.length ? await pickAssets(seriesId, assetNames) : null;
  if (picked && "error" in picked) return { error: picked.error };

  const combo = await ensureDefaultCombo();
  const [video] = await getDb()
    .insert(videos)
    .values({ title, brief, comboId: combo.id, seriesId, projectId })
    .returning({ id: videos.id });
  if (picked) await startScriptVersion(video.id, { assetNames: picked.chosen, targetSeconds });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/designs/${video.id}`);
}

// Design chưa có kịch bản: chọn asset và thời lượng rồi viết kịch bản v1.
export async function createScript(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const targetSeconds = Number(text(form, "targetSeconds"));
  const assetNames = form.getAll("assetNames").filter((v): v is string => typeof v === "string");
  if (!Number.isInteger(targetSeconds) || targetSeconds < 30 || targetSeconds > 600) return { error: TARGET_RANGE };
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return { error: "Không có design này" };
  const [existing] = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.videoId, videoId)).limit(1);
  if (existing) return { error: "Design đã có kịch bản" };
  const picked = await pickAssets(video.seriesId, assetNames);
  if ("error" in picked) return { error: picked.error };
  await startScriptVersion(videoId, { assetNames: picked.chosen, targetSeconds });
  revalidatePath(`/designs/${videoId}`);
  return {};
}

// Chỉ đổi bộ phim khi design chưa có kịch bản nào (spec §3.3 mục 2).
export async function changeDesignSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const seriesId = text(form, "seriesId");
  const db = getDb();
  const [existing] = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.videoId, videoId)).limit(1);
  if (existing) return { error: "Design đã có kịch bản, không đổi được bộ phim" };
  await db.update(videos).set({ seriesId }).where(eq(videos.id, videoId));
  revalidatePath(`/designs/${videoId}`);
  return {};
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
  revalidatePath(`/designs/${found.row.videoId}`);
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
  revalidatePath(`/designs/${found.row.videoId}`);
  return {};
}

// Kịch bản `failed` (hết lượt sửa lớp 1): viết lại phiên bản mới, không cần lý do của người.
export async function regenerateScript(_prev: FormState, form: FormData): Promise<FormState> {
  const found = await loadScript(text(form, "scriptId"));
  if (!found || found.row.status !== "failed") return { error: "Chỉ sinh lại được kịch bản bị lỗi" };
  await startScriptVersion(found.row.videoId, { ...found.content.meta, feedback: undefined });
  revalidatePath(`/designs/${found.row.videoId}`);
  return {};
}
