import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { assets, assetVariants, series } from "@/lib/db/schema";

export type Series = typeof series.$inferSelect;

export async function listSeries(): Promise<(Series & { assetCount: number })[]> {
  const rows = await getDb()
    .select({ series, assetCount: sql<number>`count(${assets.id})::int` })
    .from(series)
    .leftJoin(assets, eq(assets.seriesId, series.id))
    .groupBy(series.id)
    .orderBy(desc(series.createdAt));
  return rows.map((r) => ({ ...r.series, assetCount: r.assetCount }));
}

export async function getSeries(id: string): Promise<Series | null> {
  const [row] = await getDb().select().from(series).where(eq(series.id, id)).limit(1);
  return row ?? null;
}

// Bộ phim dùng được cho design: có ít nhất 1 nhân vật và 1 bối cảnh đã duyệt ảnh gốc.
export async function readySeriesIds(): Promise<Set<string>> {
  const rows = await getDb()
    .select({ seriesId: assets.seriesId, kind: assets.kind })
    .from(assets)
    .innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
    .where(and(eq(assets.status, "approved"), eq(assetVariants.state, "base"), eq(assetVariants.status, "approved")));
  const kinds = new Map<string, Set<string>>();
  for (const r of rows) kinds.set(r.seriesId, (kinds.get(r.seriesId) ?? new Set()).add(r.kind));
  return new Set([...kinds].filter(([, k]) => k.has("chr") && k.has("bg")).map(([id]) => id));
}
