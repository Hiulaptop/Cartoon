import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { assets, assetVariants, jobRuns } from "@/lib/db/schema";

export type Asset = typeof assets.$inferSelect;
export type AssetVariant = typeof assetVariants.$inferSelect;

export async function listAssets(seriesId: string) {
  const db = getDb();
  const rows = await db.select().from(assets).where(eq(assets.seriesId, seriesId)).orderBy(desc(assets.createdAt));
  const bases = rows.length
    ? await db
        .select()
        .from(assetVariants)
        .where(and(inArray(assetVariants.assetId, rows.map((r) => r.id)), eq(assetVariants.state, "base")))
    : [];
  const baseByAsset = new Map(bases.map((b) => [b.assetId, b]));
  return rows.map((asset) => ({ asset, base: baseByAsset.get(asset.id) ?? null }));
}

// Job tạo asset chưa có bản ghi assets (LLM chưa chạy xong) để danh sách hiện "đang tạo".
export async function listPendingAssetJobs() {
  return getDb()
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.jobType, "asset.generate_base"), inArray(jobRuns.status, ["queued", "running"])))
    .orderBy(desc(jobRuns.createdAt));
}

export async function getAsset(id: string) {
  const db = getDb();
  const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!asset) return null;
  const variants = await db
    .select()
    .from(assetVariants)
    .where(eq(assetVariants.assetId, id))
    .orderBy(asc(assetVariants.createdAt));
  return { asset, variants };
}

// URL ảnh qua route /api/files; ?v= đổi khi ảnh được sinh lại để trình duyệt không dùng ảnh cũ.
export function variantImageUrl(variant: AssetVariant): string | null {
  return variant.filePath ? `/api/files/${variant.filePath}?v=${variant.updatedAt.getTime()}` : null;
}
