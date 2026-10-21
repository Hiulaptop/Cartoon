"use server";

import { randomUUID } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { assetNameError, isAllowedState, isAssetKind } from "@/lib/assets/naming";
import { getDb } from "@/lib/db/client";
import { assets, assetVariants, reviews } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";

export type FormState = { error?: string };

function field(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function createAsset(_prev: FormState, form: FormData): Promise<FormState> {
  const kind = field(form, "kind");
  const brief = field(form, "brief");
  const displayName = field(form, "displayName");
  if (!isAssetKind(kind)) return { error: "Chọn loại asset" };
  if (brief.length < 10) return { error: "Mô tả ngắn quá (ít nhất 10 ký tự)" };
  // assetId tạo trước để job chạy lại không tạo asset trùng.
  const assetId = randomUUID();
  await enqueueJob("asset.generate_base", { assetId, kind, brief, displayName }, { type: "asset", id: assetId });
  revalidatePath("/assets");
  redirect("/assets");
}

export async function approveVariant(_prev: FormState, form: FormData): Promise<FormState> {
  const variantId = field(form, "variantId");
  const db = getDb();
  const [variant] = await db.select().from(assetVariants).where(eq(assetVariants.id, variantId)).limit(1);
  if (!variant || variant.status !== "pending_review") return { error: "Biến thể không ở trạng thái chờ duyệt" };
  const [asset] = await db.select().from(assets).where(eq(assets.id, variant.assetId)).limit(1);
  if (!asset) return { error: "Không có asset này" };

  if (variant.state === "base") {
    // Duyệt ảnh gốc = chốt tên, tên hiển thị, mô tả. Tên không đổi được sau bước này.
    const name = field(form, "name");
    const displayName = field(form, "displayName");
    const description = field(form, "description");
    const nameError = assetNameError(name, asset.kind);
    if (nameError) return { error: `Tên không hợp lệ: ${nameError}` };
    if (!displayName || !description) return { error: "Thiếu tên hiển thị hoặc mô tả" };
    const clash = await db
      .select({ id: assets.id })
      .from(assets)
      .where(and(eq(assets.name, name), ne(assets.id, asset.id)))
      .limit(1);
    if (clash.length) return { error: `Tên ${name} đã có asset khác dùng` };
    await db.update(assets).set({ name, displayName, description, status: "approved" }).where(eq(assets.id, asset.id));
  }

  await db.update(assetVariants).set({ status: "approved" }).where(eq(assetVariants.id, variant.id));
  await db.insert(reviews).values({ targetType: "asset_variant", targetId: variant.id, decision: "approved" });
  revalidatePath(`/assets/${asset.id}`);
  revalidatePath("/assets");
  return {};
}

export async function rejectVariant(_prev: FormState, form: FormData): Promise<FormState> {
  const variantId = field(form, "variantId");
  const reason = field(form, "reason");
  if (!reason) return { error: "Ghi lý do loại để lần sinh sau sửa đúng chỗ" };
  const db = getDb();
  const [variant] = await db.select().from(assetVariants).where(eq(assetVariants.id, variantId)).limit(1);
  if (!variant || variant.status !== "pending_review") return { error: "Biến thể không ở trạng thái chờ duyệt" };

  await db.update(assetVariants).set({ status: "rejected" }).where(eq(assetVariants.id, variant.id));
  await db.insert(reviews).values({ targetType: "asset_variant", targetId: variant.id, decision: "rejected", reason });
  if (variant.state === "base") await db.update(assets).set({ status: "rejected" }).where(eq(assets.id, variant.assetId));
  // Sinh lại ngay, kèm lý do loại làm nhận xét cho prompt.
  await enqueueJob(
    "asset.generate_variant",
    { assetId: variant.assetId, state: variant.state, feedback: reason },
    { type: "asset_variant", id: variant.id },
  );
  revalidatePath(`/assets/${variant.assetId}`);
  return {};
}

export async function requestVariant(_prev: FormState, form: FormData): Promise<FormState> {
  const assetId = field(form, "assetId");
  const state = field(form, "state");
  const db = getDb();
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset) return { error: "Không có asset này" };
  if (asset.status !== "approved") return { error: "Duyệt ảnh gốc trước rồi mới sinh biến thể" };
  if (!isAllowedState(asset.kind, state) || state === "base") return { error: "Trạng thái không hợp lệ" };
  await enqueueJob("asset.generate_variant", { assetId, state }, { type: "asset", id: assetId });
  revalidatePath(`/assets/${assetId}`);
  return {};
}

// Sinh lại một biến thể bị lỗi (status failed), không cần lý do.
export async function retryVariant(_prev: FormState, form: FormData): Promise<FormState> {
  const assetId = field(form, "assetId");
  const state = field(form, "state");
  await enqueueJob("asset.generate_variant", { assetId, state }, { type: "asset", id: assetId });
  revalidatePath(`/assets/${assetId}`);
  return {};
}
