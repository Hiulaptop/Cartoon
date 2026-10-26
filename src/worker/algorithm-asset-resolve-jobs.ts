import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { AssetResolutionSchema, checkResolution, resolveMessages, type AssetResolution, type ResolveRequest } from "@/lib/algorithm/asset-resolve";
import { resolveWriterModel } from "@/lib/algorithm/model";
import { STORY_BACKGROUND_PREFIX } from "@/lib/algorithm/script-check";
import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmRevisionInputs, algorithmRevisions, algorithmWorkflows, assets, assetVariants, videos } from "@/lib/db/schema";
import { enqueueJobInTransaction, type JobPayload } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";

import { PermanentJobError, type JobContext } from "./job-types";
import { describeIssues, generateStructured, LlmContentError } from "./llm-structured";

// Tên asset mới trùng trong series (kể cả asset chưa duyệt) thì thêm _2, _3...
function uniqueName(taken: Set<string>, base: string): string {
  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base.slice(0, 40 - `_${n}`.length)}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Không tìm được tên trống cho ${base}`);
}

// Truyện gốc của đề (problem V2) mà kịch bản dựa vào: script → combo → lời giải → đề. Đề V1 không có truyện thì trả chuỗi rỗng.
async function loadProblemStory(db: ReturnType<typeof getDb>, scriptRevisionId: string): Promise<string> {
  let revisionId = scriptRevisionId;
  for (let hop = 0; hop < 3; hop += 1) {
    const [edge] = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revisionId)).limit(1);
    if (!edge) return "";
    revisionId = edge.inputRevisionId;
  }
  const [problem] = await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, revisionId)).limit(1);
  const story = (problem?.content as { story?: unknown } | undefined)?.story;
  return problem?.stage === "problem" && typeof story === "string" ? story : "";
}

// Hệ thống tự gán asset cho các request của script: dùng ảnh đã duyệt, hoặc tạo thêm vào chính series của design rồi chờ người dùng duyệt ảnh.
export async function resolveAlgorithmAssets(payload: JobPayload, ctx: JobContext) {
  const videoId = typeof payload.videoId === "string" ? payload.videoId : "";
  const scriptRevisionId = typeof payload.scriptRevisionId === "string" ? payload.scriptRevisionId : "";
  if (!videoId || !scriptRevisionId) throw new PermanentJobError("Payload thiếu videoId hoặc scriptRevisionId");
  const db = getDb();
  const [video] = await db.select().from(videos).where(and(eq(videos.id, videoId), eq(videos.kind, "algorithm"))).limit(1);
  const [script] = await db.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, scriptRevisionId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "script"))).limit(1);
  if (!video || !script) throw new PermanentJobError("Không có design hoặc kịch bản để gán asset");
  const [workflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
  if (workflow?.activeScriptId !== script.id) return { stale: true };

  const pending = (await db.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.scriptRevisionId, script.id)))
    .filter((request) => request.status === "open" || request.status === "failed");
  if (!pending.length) return { nothing: true };
  // Ngữ cảnh cho từng key: mô tả hình ảnh và lời thoại của mọi cảnh dùng key đó, cùng truyện gốc của đề.
  const scenes = (script.content as { scenes?: { visual?: string; dialogue?: string[]; assetKeys?: string[] }[] }).scenes ?? [];
  const requests: ResolveRequest[] = pending.map((request) => {
    const using = scenes.filter((scene) => scene.assetKeys?.includes(request.temporaryKey));
    return {
      key: request.temporaryKey,
      role: request.temporaryKey.startsWith(STORY_BACKGROUND_PREFIX) ? "background" : "subject",
      visual: using.map((scene) => scene.visual ?? "").filter(Boolean).join(" | ") || request.brief,
      dialogue: using.flatMap((scene) => scene.dialogue ?? []).slice(0, 10),
    };
  });
  const story = await loadProblemStory(db, script.id);
  const catalog = await loadApprovedCatalog(video.seriesId);
  let model: string;
  try { model = resolveWriterModel(payload); } catch (error) { throw new PermanentJobError(error instanceof Error ? error.message : String(error)); }

  let generated: Awaited<ReturnType<typeof generateStructured<AssetResolution>>>;
  try {
    generated = await generateStructured<AssetResolution>({
      label: "Gán asset LLM", model, messages: resolveMessages(catalog, requests, story), ctx, temperature: 0.2, timeoutMs: 240_000,
      parse: (raw) => {
        const parsed = AssetResolutionSchema.safeParse(raw);
        if (!parsed.success) return { ok: false, problems: describeIssues(parsed.error) };
        const problems = checkResolution(parsed.data, requests, catalog);
        return problems.length ? { ok: false, problems } : { ok: true, data: parsed.data };
      },
    });
  } catch (error) {
    // Request giữ nguyên `open` để người dùng gán tay hoặc bấm gán lại.
    if (error instanceof LlmContentError) throw new PermanentJobError(error.message);
    throw error;
  }

  const byKey = new Map(generated.data.items.map((item) => [item.key, item] as const));
  let bound = 0;
  let generating = 0;
  await db.transaction(async (tx) => {
    const taken = new Set((await tx.select({ name: assets.name }).from(assets).where(eq(assets.seriesId, video.seriesId))).map((row) => row.name));
    // "same" xử lý sau cùng để chép đúng kết quả của key được trỏ tới.
    const ordered = [...pending].sort((left, right) => Number(byKey.get(left.temporaryKey)?.action === "same") - Number(byKey.get(right.temporaryKey)?.action === "same"));
    for (const request of ordered) {
      const item = byKey.get(request.temporaryKey);
      if (!item) continue;
      const [fresh] = await tx.select().from(algorithmAssetRequests).where(eq(algorithmAssetRequests.id, request.id)).limit(1);
      if (!fresh || !["open", "failed"].includes(fresh.status)) continue;
      if (item.action === "same") {
        const [target] = await tx.select().from(algorithmAssetRequests)
          .where(and(eq(algorithmAssetRequests.scriptRevisionId, script.id), eq(algorithmAssetRequests.temporaryKey, item.as))).limit(1);
        if (!target?.assetId || !target.state || !["bound", "generating", "pending_review"].includes(target.status)) continue;
        await tx.update(algorithmAssetRequests).set({ status: target.status, assetId: target.assetId, state: target.state, reason: "" }).where(eq(algorithmAssetRequests.id, request.id));
        if (target.status === "bound") bound += 1; else generating += 1;
      } else if (item.action === "use") {
        const asset = catalog.get(item.asset)!;
        await tx.update(algorithmAssetRequests).set({ status: "bound", assetId: asset.id, state: item.state, reason: "" }).where(eq(algorithmAssetRequests.id, request.id));
        bound += 1;
      } else if (item.action === "newVariant") {
        // Khoá ngoại (asset_id, state) -> asset_variants: hàng biến thể phải có trước khi gắn vào request.
        const asset = catalog.get(item.asset)!;
        const [row] = await tx.select().from(assetVariants).where(and(eq(assetVariants.assetId, asset.id), eq(assetVariants.state, item.state))).limit(1);
        if (!row) await tx.insert(assetVariants).values({ assetId: asset.id, state: item.state, prompt: "", status: "generating" });
        if (!row || row.status === "failed") await enqueueJobInTransaction(tx, "asset.generate_variant", { assetId: asset.id, state: item.state }, { type: "asset", id: asset.id });
        await tx.update(algorithmAssetRequests).set({ status: "generating", assetId: asset.id, state: item.state, reason: "" }).where(eq(algorithmAssetRequests.id, request.id));
        generating += 1;
      } else {
        const name = uniqueName(taken, item.name);
        taken.add(name);
        const assetId = randomUUID();
        await tx.insert(assets).values({ id: assetId, seriesId: video.seriesId, name, kind: item.kind, displayName: item.displayName, description: item.description, status: "draft" });
        await tx.insert(assetVariants).values({ assetId, state: "base", prompt: "", status: "generating" });
        await enqueueJobInTransaction(tx, "asset.generate_base", { assetId, seriesId: video.seriesId, kind: item.kind, brief: item.description }, { type: "asset", id: assetId });
        await tx.update(algorithmAssetRequests).set({ status: "generating", assetId, state: "base", reason: "" }).where(eq(algorithmAssetRequests.id, request.id));
        generating += 1;
      }
    }
  });
  return { model: generated.model, usage: generated.usage, bound, generating };
}
