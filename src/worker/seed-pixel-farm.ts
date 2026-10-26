import { and, eq } from "drizzle-orm";

import { PIXEL_FARM_ASSETS, PIXEL_FARM_SERIES } from "@/lib/assets/pixel-farm";
import { getDb, getPool } from "@/lib/db/client";
import { assets, assetVariants, series } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";

// Nạp series Pixel Farm và đẩy job sinh ảnh gốc cho từng asset (chạy lại chỉ bù asset chưa có ảnh gốc).
// Ảnh ra ở trạng thái chờ duyệt: duyệt từng ảnh trong trang series.
async function main() {
  const db = getDb();
  try {
    let [farm] = await db.select().from(series).where(eq(series.name, PIXEL_FARM_SERIES)).limit(1);
    if (!farm) [farm] = await db.insert(series).values({ name: PIXEL_FARM_SERIES }).returning();
    let queued = 0;
    let skipped = 0;
    for (const spec of PIXEL_FARM_ASSETS) {
      let [asset] = await db.select().from(assets).where(and(eq(assets.seriesId, farm.id), eq(assets.name, spec.name))).limit(1);
      if (asset) {
        const [base] = await db.select({ id: assetVariants.id }).from(assetVariants).where(and(eq(assetVariants.assetId, asset.id), eq(assetVariants.state, "base"))).limit(1);
        if (base) { skipped += 1; continue; }
      } else {
        [asset] = await db.insert(assets).values({ seriesId: farm.id, name: spec.name, kind: spec.kind, displayName: spec.displayName, description: spec.description, status: "draft" }).returning();
      }
      await enqueueJob("asset.generate_base", { assetId: asset.id, seriesId: farm.id, kind: spec.kind, brief: spec.description }, { type: "asset", id: asset.id });
      queued += 1;
    }
    console.log(`Pixel Farm: đã xếp hàng ${queued} asset, bỏ qua ${skipped} asset đã có ảnh gốc. Chạy worker rồi duyệt ảnh tại /series/${farm.id}`);
  } finally {
    await getPool().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
