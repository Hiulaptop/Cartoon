"use server";

import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assetNameError, isAssetKind } from "@/lib/assets/naming";
import { parseGenerationSize } from "@/lib/assets/generation-size";
import { getDb } from "@/lib/db/client";
import { assets, assetVariants, reviews } from "@/lib/db/schema";
import { resolveProposalsAfterApproval } from "@/lib/casting/queries";
import { bindRequestsAfterApproval } from "@/lib/algorithm/asset-binding";
import { enqueueJob, enqueueJobInTransaction } from "@/lib/queue/jobs";
import { lockVariantCommand } from "@/lib/assets/generation-lock";
import { assertNoActiveComfy, assertNoImageDelivery, lockAssetVariant, requestComfyVariant, resumeComfyRun, abandonComfyRun, inspectComfyRun } from "@/lib/comfy/runs";
import { WorkflowRefSchema } from "@/lib/comfy/contracts";

import type { FormState } from "@/lib/form";

// Làm mới trang bộ phim và trang asset sau khi asset đổi (đường dẫn phụ thuộc bộ phim của asset).
async function refreshAsset(assetId: string) {
  const [owner] = await getDb().select({ seriesId: assets.seriesId }).from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!owner) return;
  revalidatePath(`/series/${owner.seriesId}/assets/${assetId}`);
  revalidatePath(`/series/${owner.seriesId}`);
  // Asset có thể đang được duyệt từ tab Casting của một design.
  revalidatePath("/designs", "layout");
}

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createAsset(_prev: FormState, form: FormData): Promise<FormState> {
  const kind = field(form, "kind");
  const brief = field(form, "brief");
  const displayName = field(form, "displayName");
  const seriesId = field(form, "seriesId");
  if (!seriesId) return { error: "Thiếu bộ phim" };
  if (!isAssetKind(kind)) return { error: "Chọn loại asset" };
  if (brief.length < 10) return { error: "Mô tả ngắn quá (ít nhất 10 ký tự)" };
  let generationSize;
  try { generationSize = parseGenerationSize(form.get("generationSize")); }
  catch { return { error: "Chọn kích thước yêu cầu trong danh sách preset" }; }
  // assetId tạo trước để job chạy lại không tạo asset trùng.
  const assetId = randomUUID();
  await enqueueJob("asset.generate_base", { assetId, seriesId, kind, brief, displayName, generationSize }, { type: "asset", id: assetId });
  revalidatePath(`/series/${seriesId}`);
  redirect(`/series/${seriesId}`);
}

export async function approveVariant(_prev: FormState, form: FormData): Promise<FormState> {
  const variantId = field(form, "variantId");
  const db = getDb();
  const [initial] = await db.select().from(assetVariants).where(eq(assetVariants.id, variantId)).limit(1);
  if (!initial) return { error: "Không có biến thể" };
  try {
  const { asset, variant } = await db.transaction(async (tx) => {
  await lockVariantCommand(tx, initial);
  const { asset, variant } = await lockAssetVariant(tx, initial);
  if (!variant || variant.id !== variantId || variant.status !== "pending_review") throw new Error("Biến thể không còn chờ duyệt");
  await assertNoActiveComfy(tx, variant.id);
  await assertNoImageDelivery(tx, initial);

  if (variant.state === "base") {
    // Duyệt ảnh gốc = chốt tên, tên hiển thị, mô tả. Tên không đổi được sau bước này.
    const name = field(form, "name");
    const displayName = field(form, "displayName");
    const description = field(form, "description");
    const nameError = assetNameError(name, asset.kind);
    if (nameError) throw new Error(`Tên không hợp lệ: ${nameError}`);
    if (!displayName || !description) throw new Error("Thiếu tên hiển thị hoặc mô tả");
    const clash = await tx
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.seriesId, asset.seriesId), eq(assets.name, name), ne(assets.id, asset.id)))
      .limit(1);
    if (clash.length) throw new Error(`Tên ${name} đã có asset khác dùng`);
    await tx.update(assets).set({ name, displayName, description, status: "approved" }).where(eq(assets.id, asset.id));
  }

  await tx.update(assetVariants).set({ status: "approved" }).where(eq(assetVariants.id, variant.id));
  await tx.insert(reviews).values({ targetType: "asset_variant", targetId: variant.id, decision: "approved" });
  return { asset, variant };
  });
  // Đề xuất casting khớp chuyển sang approved; duyệt ảnh gốc thì sinh các biến thể đang chờ (spec ai-casting §3).
  try {
    await resolveProposalsAfterApproval(asset.id, variant.state);
    await bindRequestsAfterApproval(asset.id, variant.state);
  } catch {
    await refreshAsset(asset.id);
    return { error: "Ảnh đã được duyệt; đồng bộ casting/binding chưa hoàn tất. Không sinh ảnh lại." };
  }
  await refreshAsset(asset.id);
  return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không duyệt được ảnh" }; }
}

async function generateExistingVariant(form: FormData, mode: "request" | "retry" | "reject"): Promise<FormState> {
  try {
    let assetId = field(form, "assetId"), state = field(form, "state");
    const variantId = field(form, "variantId");
    const reason = field(form, "reason");
    if (mode === "reject") {
      if (!reason || reason.length > 10000) throw new Error("Ghi lý do loại (tối đa 10000 ký tự)");
      const [v] = await getDb().select().from(assetVariants).where(eq(assetVariants.id, variantId));
      if (!v) throw new Error("Không có biến thể");
      assetId = v.assetId; state = v.state;
    }
    const backend = field(form, "backend") || "9router";
    if (!["9router", "comfyui"].includes(backend)) throw new Error("Backend không hợp lệ");
    if (backend === "comfyui") {
      if (field(form, "allowCompute") !== "yes") throw new Error("Cần xác nhận cho phép dùng GPU");
      await requestComfyVariant({ assetId, state, workflow: WorkflowRefSchema.parse({ id: field(form, "workflowId"), revision: field(form, "workflowRevision"), sha256: field(form, "workflowHash") }), ...(mode === "reject" ? { feedback: reason, rejectedVariantId: variantId } : {}) });
    } else {
      await getDb().transaction(async (tx) => {
        const key = { assetId, state };
        await lockVariantCommand(tx, key);
        const { asset, variant } = await lockAssetVariant(tx, key);
        if (state === "base" ? asset.status === "approved" : asset.status !== "approved") throw new Error("Duyệt ảnh gốc trước; không sinh lại base đã duyệt");
        if (variant) await assertNoActiveComfy(tx, variant.id);
        await assertNoImageDelivery(tx, key);
        if (mode === "reject") {
          if (!variant || variant.id !== variantId || variant.status !== "pending_review") throw new Error("Biến thể không còn chờ duyệt");
          await tx.insert(reviews).values({ targetType: "asset_variant", targetId: variant.id, decision: "rejected", reason });
        } else if (mode === "request" ? !!variant || state === "base" : !variant || !["failed", "rejected"].includes(variant.status)) throw new Error("Trạng thái biến thể không cho phép yêu cầu này");
        await tx.insert(assetVariants).values({ assetId, state, status: "generating" }).onConflictDoUpdate({ target: [assetVariants.assetId, assetVariants.state], set: { status: "generating" } });
        if (state === "base") await tx.update(assets).set({ status: "generating" }).where(eq(assets.id, assetId));
        await enqueueJobInTransaction(tx, "asset.generate_variant", { assetId, state, ...(reason ? { feedback: reason } : {}) }, { type: "asset", id: assetId });
      });
    }
    await refreshAsset(assetId);
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không tạo được yêu cầu ảnh" }; }
}

export async function rejectVariant(_prev: FormState, form: FormData): Promise<FormState> {
  return generateExistingVariant(form, "reject");
}
export async function requestVariant(_prev: FormState, form: FormData): Promise<FormState> {
  return generateExistingVariant(form, "request");
}
export async function retryVariant(_prev: FormState, form: FormData): Promise<FormState> {
  return generateExistingVariant(form, "retry");
}
async function reconcile(form: FormData, mode: "resume" | "inspect" | "abandon"): Promise<FormState> {
  try {
    const input = { runId: field(form, "runId"), expectedUpdatedAt: field(form, "expectedUpdatedAt") };
    if (mode === "resume") await resumeComfyRun(input);
    else if (mode === "inspect") await inspectComfyRun(input);
    else {
      if (field(form, "workerStopped") !== "yes" || field(form, "upstreamChecked") !== "yes") throw new Error("Cần xác nhận dừng worker và kiểm upstream");
      await abandonComfyRun({ ...input, note: field(form, "note"), workerStopped: true, upstreamChecked: true });
    }
    revalidatePath("/series", "layout");
    return {};
  } catch (error) { return { error: error instanceof Error ? error.message : "Không đối soát được" }; }
}
export async function resumeComfyImage(_prev: FormState, form: FormData): Promise<FormState> { return reconcile(form, "resume"); }
export async function inspectComfyImage(_prev: FormState, form: FormData): Promise<FormState> { return reconcile(form, "inspect"); }
export async function abandonComfyImage(_prev: FormState, form: FormData): Promise<FormState> { return reconcile(form, "abandon"); }
