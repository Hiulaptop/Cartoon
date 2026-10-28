import { and, eq } from "drizzle-orm";
import sharp from "sharp";

import { keyAndTrim, toPng } from "@/lib/assets/image";
import { assetNameError, isAllowedState, isAssetKind, toAssetName, type AssetKind } from "@/lib/assets/naming";
import { PIXEL_FARM_SERIES } from "@/lib/assets/pixel-farm";
import { imagePrompt, parseProposal, proposalMessages, type ArtStyle } from "@/lib/assets/prompts";
import { generationSizeInfo, parseGenerationSize, type AssetGenerationSize } from "@/lib/assets/generation-size";
import { getDb } from "@/lib/db/client";
import { assets, assetVariants, series } from "@/lib/db/schema";
import { chat, generateImage, ImageGenerationRequestError, requireModel } from "@/lib/ninerouter/client";
import type { JobPayload } from "@/lib/queue/jobs";
import { writeDataFile } from "@/lib/storage";

import { PermanentJobError } from "./job-types";

function str(payload: JobPayload, key: string): string {
  const value = payload[key];
  if (typeof value !== "string" || !value) throw new PermanentJobError(`Payload thiếu "${key}"`);
  return value;
}

// Tên đề xuất trùng trong cùng bộ phim thì thêm _2, _3...
async function uniqueName(seriesId: string, base: string): Promise<string> {
  const db = getDb();
  for (let n = 1; n < 100; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 40 - `_${n}`.length)}_${n}`;
    const taken = await db.select({ id: assets.id }).from(assets).where(and(eq(assets.seriesId, seriesId), eq(assets.name, candidate))).limit(1);
    if (taken.length === 0) return candidate;
  }
  throw new Error(`Không tìm được tên trống cho ${base}`);
}

// Series Pixel Farm vẽ pixel art; mọi series khác giữ phong cách hoạt hình phẳng.
async function styleOfSeries(seriesId: string): Promise<ArtStyle> {
  const [row] = await getDb().select({ name: series.name }).from(series).where(eq(series.id, seriesId)).limit(1);
  return row?.name === PIXEL_FARM_SERIES ? "pixel" : "cartoon";
}

// Sinh ảnh cho một biến thể, xử lý, lưu file, chuyển sang chờ duyệt.
function assetSize(input: unknown): AssetGenerationSize | null {
  try { return parseGenerationSize(input); }
  catch { throw new PermanentJobError("Kích thước yêu cầu của asset không hợp lệ"); }
}

async function renderVariant(assetId: string, kind: AssetKind, description: string, state: string, generationSize: AssetGenerationSize | null, feedback: string | undefined, style: ArtStyle) {
  const db = getDb();
  const prompt = imagePrompt(kind, description, state, feedback, style, generationSize);
  const where = and(eq(assetVariants.assetId, assetId), eq(assetVariants.state, state));
  await db
    .insert(assetVariants)
    .values({ assetId, state, prompt, status: "generating" })
    .onConflictDoUpdate({
      target: [assetVariants.assetId, assetVariants.state],
      set: { prompt, status: "generating", sourceWidth: null, sourceHeight: null },
    });

  try {
    const model = requireModel("IMAGE_MODEL");
    const image = await generateImage({ model, prompt, size: generationSize ?? undefined });
    const source = await sharp(image.data).metadata();
    if (!source.width || !source.height) throw new Error("Ảnh nguồn không có kích thước hợp lệ");
    const processed = kind === "bg" ? await toPng(image.data) : await keyAndTrim(image.data);
    const filePath = `assets/${assetId}/${state}.png`;
    await writeDataFile(filePath, processed.data);
    await db
      .update(assetVariants)
      .set({ filePath, width: processed.width, height: processed.height, sourceWidth: source.width, sourceHeight: source.height, status: "pending_review" })
      .where(where);
    const requested = generationSize ? generationSizeInfo(generationSize) : null;
    return { model, state, requestedSize: generationSize, transportSize: image.transportSize, sourceWidth: source.width, sourceHeight: source.height, sizeMismatch: requested ? source.width !== requested.width || source.height !== requested.height : null, width: processed.width, height: processed.height, sourceMime: image.mime };
  } catch (error) {
    await db.update(assetVariants).set({ status: "failed" }).where(where);
    if (error instanceof ImageGenerationRequestError && (error.status === 400 || error.status === 422)) throw new PermanentJobError(error.message);
    throw error;
  }
}

// Bước 1a: LLM viết mô tả và đề xuất tên, rồi sinh ảnh base.
// assetId do app tạo trước, nên chạy lại job không tạo asset trùng.
export async function generateBase(payload: JobPayload) {
  const assetId = str(payload, "assetId");
  const kind = str(payload, "kind");
  const brief = str(payload, "brief");
  const seriesId = str(payload, "seriesId");
  if (!isAssetKind(kind)) throw new PermanentJobError(`Loại asset không hợp lệ: ${kind}`);
  const db = getDb();

  let [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  let usage: unknown = null;
  if (!asset) {
    const generationSize = assetSize(payload.generationSize);
    const model = requireModel("LLM_WRITER_MODEL");
    const res = await chat({ model, messages: proposalMessages(kind, brief), temperature: 0.4 });
    usage = { model: res.model, ...res.usage };
    const proposal = parseProposal(res.content);
    let name = toAssetName(proposal.name, kind);
    if (assetNameError(name, kind)) name = toAssetName(brief, kind);
    name = await uniqueName(seriesId, name);
    const displayName = typeof payload.displayName === "string" && payload.displayName ? payload.displayName : proposal.displayName;
    [asset] = await db
      .insert(assets)
      .values({ id: assetId, seriesId, name, kind, displayName, description: proposal.description, generationSize, status: "generating" })
      .returning();
  }

  const result = await renderVariant(asset.id, asset.kind, asset.description, "base", assetSize(asset.generationSize), undefined, await styleOfSeries(asset.seriesId));
  await db.update(assets).set({ status: "pending_review" }).where(eq(assets.id, asset.id));
  return { name: asset.name, llm: usage, image: result };
}

// Sinh (lại) một biến thể. feedback = lý do bị loại lần trước.
export async function generateVariant(payload: JobPayload) {
  const assetId = str(payload, "assetId");
  const state = str(payload, "state");
  const feedback = typeof payload.feedback === "string" ? payload.feedback : undefined;
  const db = getDb();
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId)).limit(1);
  if (!asset) throw new PermanentJobError(`Không có asset ${assetId}`);
  if (!isAllowedState(asset.kind, state)) throw new PermanentJobError(`Trạng thái ${state} không hợp lệ cho ${asset.kind}`);
  const image = await renderVariant(asset.id, asset.kind, asset.description, state, assetSize(asset.generationSize), feedback, await styleOfSeries(asset.seriesId));
  if (state === "base") await db.update(assets).set({ status: "pending_review" }).where(eq(assets.id, asset.id));
  return { name: asset.name, image };
}
