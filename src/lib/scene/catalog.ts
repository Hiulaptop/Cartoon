import { and, eq, isNotNull } from "drizzle-orm";

import type { AssetKind } from "@/lib/assets/naming";
import { getDb } from "@/lib/db/client";
import { assets, assetVariants } from "@/lib/db/schema";

export type CatalogVariant = { path: string; width: number; height: number };
export type CatalogAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  displayName: string;
  description: string;
  variants: Map<string, CatalogVariant>;
};
// Khóa = tên asset ("chr_minh"). Chỉ gồm asset đã duyệt và biến thể đã duyệt có ảnh.
export type Catalog = Map<string, CatalogAsset>;

export async function loadApprovedCatalog(): Promise<Catalog> {
  const rows = await getDb()
    .select({ asset: assets, variant: assetVariants })
    .from(assets)
    .innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
    .where(
      and(
        eq(assets.status, "approved"),
        eq(assetVariants.status, "approved"),
        isNotNull(assetVariants.filePath),
        isNotNull(assetVariants.width),
        isNotNull(assetVariants.height),
      ),
    );
  const catalog: Catalog = new Map();
  for (const { asset, variant } of rows) {
    let entry = catalog.get(asset.name);
    if (!entry) {
      entry = {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        displayName: asset.displayName,
        description: asset.description,
        variants: new Map(),
      };
      catalog.set(asset.name, entry);
    }
    entry.variants.set(variant.state, { path: variant.filePath!, width: variant.width!, height: variant.height! });
  }
  return catalog;
}
