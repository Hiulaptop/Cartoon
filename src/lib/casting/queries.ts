import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { assetProposals, assets, assetVariants, jobRuns } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/queue/jobs";

export type Proposal = typeof assetProposals.$inferSelect;

export async function openProposalCount(videoId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(assetProposals)
    .where(and(eq(assetProposals.videoId, videoId), eq(assetProposals.decision, "open")));
  return row?.n ?? 0;
}

// Dữ liệu tab Casting: đề xuất kèm asset và biến thể tương ứng, job casting gần nhất (lỗi, useAssets).
export async function getCasting(videoId: string) {
  const db = getDb();
  const proposals = await db
    .select()
    .from(assetProposals)
    .where(eq(assetProposals.videoId, videoId))
    .orderBy(asc(assetProposals.createdAt), asc(assetProposals.state));
  const assetIds = [...new Set(proposals.map((p) => p.assetId))];
  const [assetRows, variantRows] = assetIds.length
    ? await Promise.all([
        db.select().from(assets).where(inArray(assets.id, assetIds)),
        db.select().from(assetVariants).where(inArray(assetVariants.assetId, assetIds)),
      ])
    : [[], []];
  const [job] = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.jobType, "casting.propose"), eq(jobRuns.targetId, videoId)))
    .orderBy(desc(jobRuns.createdAt))
    .limit(1);
  const useAssets = ((job?.metrics as { useAssets?: string[] } | null)?.useAssets ?? []).filter((n) => typeof n === "string");
  return {
    proposals,
    assetById: new Map(assetRows.map((a) => [a.id, a])),
    variantByKey: new Map(variantRows.map((v) => [`${v.assetId}.${v.state}`, v])),
    job: job ?? null,
    useAssets,
  };
}

// Gọi sau khi một ảnh (gốc hoặc biến thể) được duyệt: đề xuất khớp chuyển sang approved; nếu là ảnh gốc
// thì đẩy job sinh các biến thể đang chờ của asset đó (biến thể chỉ sinh khi asset đã duyệt).
export async function resolveProposalsAfterApproval(assetId: string, state: string): Promise<void> {
  const db = getDb();
  await db
    .update(assetProposals)
    .set({ decision: "approved" })
    .where(and(eq(assetProposals.assetId, assetId), eq(assetProposals.state, state), eq(assetProposals.decision, "open")));
  if (state !== "base") return;
  const pending = await db
    .select()
    .from(assetProposals)
    .where(and(eq(assetProposals.assetId, assetId), eq(assetProposals.kind, "variant"), eq(assetProposals.decision, "open")));
  const states = [...new Set(pending.map((p) => p.state))];
  for (const s of states) {
    const [existing] = await db
      .select({ id: assetVariants.id })
      .from(assetVariants)
      .where(and(eq(assetVariants.assetId, assetId), eq(assetVariants.state, s)))
      .limit(1);
    if (!existing) await enqueueJob("asset.generate_variant", { assetId, state: s }, { type: "asset", id: assetId });
  }
}

// Bỏ một đề xuất. Bỏ đề xuất asset mới thì bỏ luôn các đề xuất biến thể của asset đó trong cùng design.
export async function dropProposalById(proposalId: string): Promise<Proposal | null> {
  const db = getDb();
  const [p] = await db.select().from(assetProposals).where(eq(assetProposals.id, proposalId)).limit(1);
  if (!p || p.decision !== "open") return null;
  if (p.kind === "asset") {
    await db
      .update(assetProposals)
      .set({ decision: "dropped" })
      .where(and(eq(assetProposals.videoId, p.videoId), eq(assetProposals.assetId, p.assetId), eq(assetProposals.decision, "open")));
  } else {
    await db.update(assetProposals).set({ decision: "dropped" }).where(eq(assetProposals.id, p.id));
  }
  return p;
}
