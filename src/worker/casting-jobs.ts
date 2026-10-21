import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { getDb, type Db } from "@/lib/db/client";
import { assetProposals, assets, assetVariants, validations, videos } from "@/lib/db/schema";
import { checkCasting } from "@/lib/casting/check";
import { castingMessages } from "@/lib/casting/prompts";
import { castingSchema } from "@/lib/casting/schema";
import { extractJson } from "@/lib/llm/json";
import { chat, requireModel } from "@/lib/ninerouter/client";
import { enqueueJob, type JobPayload } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { ensureDefaultCombo } from "@/lib/script/combo";

import { PermanentJobError } from "./job-types";

const RUBRIC = "l1-casting-v1";
const DEFAULT_TARGET_SECONDS = 90;

// Pha 1 (spec ai-casting): AI đề xuất asset mới và biến thể còn thiếu; hệ thống đẩy job sinh ảnh.
// Idempotent: design đã có đề xuất thì không gọi lại model.
export async function proposeCasting(payload: JobPayload) {
  const videoId = typeof payload.videoId === "string" ? payload.videoId : "";
  if (!videoId) throw new PermanentJobError('Payload thiếu "videoId"');
  const targetSeconds = typeof payload.targetSeconds === "number" ? payload.targetSeconds : DEFAULT_TARGET_SECONDS;
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) throw new PermanentJobError(`Không có design ${videoId}`);
  const [existing] = await db.select({ id: assetProposals.id }).from(assetProposals).where(eq(assetProposals.videoId, videoId)).limit(1);
  if (existing) return { skipped: "đã có đề xuất" };

  const catalog = await loadApprovedCatalog(video.seriesId);
  const { definition: combo } = await ensureDefaultCombo();
  const model = requireModel("LLM_WRITER_MODEL");
  const res = await chat({ model, temperature: 0.5, timeoutMs: 180_000, messages: castingMessages({ brief: video.brief, targetSeconds, catalog, combo }) });

  let raw: unknown;
  try {
    raw = extractJson(res.content);
  } catch (error) {
    throw new Error(`Đề xuất không phải JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) delete (raw as Record<string, unknown>)["$schema"];
  const parsed = castingSchema.safeParse(raw);
  if (!parsed.success) {
    // Thử lại theo cơ chế job (tối đa 3 lần): model có thể trả đúng khuôn ở lần sau.
    throw new Error(`Đề xuất sai khuôn: ${parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }

  // Biến thể đang sinh/chờ duyệt của bộ phim: không đề xuất lại để khỏi ghi đè.
  const seriesAssets = await db.select({ id: assets.id, name: assets.name }).from(assets).where(eq(assets.seriesId, video.seriesId));
  const nameById = new Map(seriesAssets.map((a) => [a.id, a.name]));
  const busy = seriesAssets.length
    ? await db
        .select({ assetId: assetVariants.assetId, state: assetVariants.state })
        .from(assetVariants)
        .where(and(inArray(assetVariants.assetId, [...nameById.keys()]), inArray(assetVariants.status, ["generating", "pending_review"])))
    : [];
  const inFlight = new Set(busy.map((b) => `${nameById.get(b.assetId)}.${b.state}`));
  const { result, issues } = checkCasting(parsed.data, { catalog, inFlight });

  // Ghi đề xuất và đẩy job trong cùng transaction: worker chết giữa chừng thì không có đề xuất nào thiếu job
  // (lần thử lại thấy đã có đề xuất sẽ bỏ qua). enqueueJob mở transaction lồng = savepoint của Drizzle.
  const jobs: { type: "asset.generate_base" | "asset.generate_variant"; payload: JobPayload; assetId: string }[] = [];
  await db.transaction(async (tx) => {
    for (const a of result.newAssets) {
      const assetId = randomUUID();
      await tx.insert(assetProposals).values({ videoId, kind: "asset", assetId, state: "base", brief: a.brief, reason: a.reason });
      for (const state of a.states) {
        await tx.insert(assetProposals).values({ videoId, kind: "variant", assetId, state, reason: `Cho asset mới "${a.displayName}"` });
      }
      jobs.push({
        type: "asset.generate_base",
        payload: { assetId, seriesId: video.seriesId, kind: a.kind, brief: a.brief, displayName: a.displayName },
        assetId,
      });
    }
    for (const v of result.newVariants) {
      const asset = catalog.get(v.asset)!;
      await tx.insert(assetProposals).values({ videoId, kind: "variant", assetId: asset.id, state: v.state, reason: v.reason });
      jobs.push({ type: "asset.generate_variant", payload: { assetId: asset.id, state: v.state }, assetId: asset.id });
    }
    await tx.insert(validations).values({
      targetType: "video",
      targetId: videoId,
      validatorModel: "layer1",
      rubricVersion: RUBRIC,
      scores: { issues, newAssets: result.newAssets.length, newVariants: result.newVariants.length },
      verdict: issues.length ? "fail" : "pass",
      feedback: issues.join("\n"),
    });
    for (const j of jobs) await enqueueJob(j.type, j.payload, { type: "asset", id: j.assetId }, tx as unknown as Db);
  });

  return {
    model: res.model,
    usage: res.usage,
    useAssets: result.useAssets,
    newAssets: result.newAssets.length,
    newVariants: result.newVariants.length,
    dropped: issues.length,
  };
}
