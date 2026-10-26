import { and, eq, inArray } from "drizzle-orm";

import type { AssetFileBinding } from "@/lib/algorithm/animation/playback";
import { getDb, type Db } from "@/lib/db/client";
import { algorithmAssetRequests, assets, assetVariants } from "@/lib/db/schema";

// Gọi sau khi một ảnh (asset + biến thể) được duyệt: request đang chờ ảnh đó chuyển sang bound
// (trigger algorithm_guard_asset_binding yêu cầu asset và biến thể đã approved nên phải gọi sau khi cập nhật trạng thái duyệt).
export async function bindRequestsAfterApproval(assetId: string, state: string): Promise<void> {
  await getDb().update(algorithmAssetRequests).set({ status: "bound" })
    .where(and(eq(algorithmAssetRequests.assetId, assetId), eq(algorithmAssetRequests.state, state), inArray(algorithmAssetRequests.status, ["generating", "pending_review"])));
}

// File ảnh đã duyệt của mọi request đã gắn trong một kịch bản: nguồn để video vẽ asset theo từng cảnh.
export async function loadBoundAssetFiles(scriptRevisionId: string, db: Db = getDb()): Promise<AssetFileBinding[]> {
  const rows = await db.select({ temporaryKey: algorithmAssetRequests.temporaryKey, kind: assets.kind, filePath: assetVariants.filePath, width: assetVariants.width, height: assetVariants.height })
    .from(algorithmAssetRequests)
    .innerJoin(assets, eq(assets.id, algorithmAssetRequests.assetId))
    .innerJoin(assetVariants, and(eq(assetVariants.assetId, algorithmAssetRequests.assetId), eq(assetVariants.state, algorithmAssetRequests.state)))
    .where(and(eq(algorithmAssetRequests.scriptRevisionId, scriptRevisionId), eq(algorithmAssetRequests.status, "bound"), eq(assets.status, "approved"), eq(assetVariants.status, "approved")));
  return rows.flatMap((row) => (row.filePath ? [{ temporaryKey: row.temporaryKey, kind: row.kind, filePath: row.filePath, aspect: row.width && row.height ? row.width / row.height : 1 }] : []));
}
