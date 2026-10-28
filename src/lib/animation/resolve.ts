// Server/CLI only. No DB mutation or model call; all file reads originate in approved catalog.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import sharp from "sharp";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { parseRef } from "@/lib/scene/refs";
import { dataPath, writeDataFile } from "@/lib/storage";
import { draftSchema } from "./schema";
import type { ShowcaseProps } from "./types";

export async function resolveShowcase(input: unknown, forExport = false): Promise<ShowcaseProps> {
  const draft = draftSchema.parse(input), catalog = await loadApprovedCatalog(draft.seriesId);
  if (forExport && draft.layout.mode === "ground_plane" && !draft.layout.confirmed) throw new Error("Cần xác nhận ground layout trước export");
  const assets: ShowcaseProps["assets"] = {}, warnings: string[] = [];
  let totalBytes = 0;
  async function resolve(raw: string) {
    if (assets[raw]) return;
    const ref = parseRef(raw), asset = ref && catalog.get(ref.name), state = ref?.state ?? "base";
    const variant = asset && asset.variants.get(state);
    if (!ref || !asset || !variant) throw new Error(`${raw}: không có variant đã duyệt trong series đã chọn`);
    const file = dataPath(variant.path), info = await stat(file);
    if (!info.isFile() || info.size > 20 * 1024 * 1024 || (totalBytes += info.size) > 64 * 1024 * 1024) throw new Error("Asset quá lớn: tối đa 20 MB/ảnh, 64 MB/showcase");
    const bytes = await readFile(file), metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1) throw new Error(`${raw}: cần ảnh PNG/JPEG/WebP tĩnh`);
    if (metadata.orientation && metadata.orientation !== 1) throw new Error(`${raw}: cần ảnh đã chuẩn hóa hướng, không dùng EXIF xoay ảnh trong lab`);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (forExport && draft.assetFingerprints[raw] !== hash) throw new Error(`${raw}: fingerprint thiếu/đã đổi; mở lại lab để xem và tải draft mới`);
    const path = `experiments/remotion-animation/preview-assets/${hash}.${metadata.format === "jpeg" ? "jpg" : metadata.format}`;
    await writeDataFile(path, bytes);
    assets[raw] = { path, width: metadata.width, height: metadata.height, hash };
    if (draft.midgroundItems.some(item => item.ref === raw) && (!metadata.hasAlpha || (await sharp(bytes).stats()).isOpaque)) throw new Error(`${raw}: midground cần cutout có pixel trong suốt; không tự tách ảnh phẳng`);
  }
  await resolve(draft.backgroundRef);
  const bg = assets[draft.backgroundRef];
  if (bg.width * 9 !== bg.height * 16) throw new Error(`Nền ${bg.width}×${bg.height} chưa đúng 16:9. Cần nền 16:9 đã duyệt; lab không resize/crop ảnh gốc.`);
  const main = catalog.get(draft.characterRef.slice(1));
  if (!main || main.kind !== "chr" || main.variants.size === 0) throw new Error("Cần nhân vật có state đã duyệt");
  const states = [...main.variants.keys()].sort();
  for (const state of states) await resolve(`${draft.characterRef}.${state}`);
  for (const state of Object.keys(draft.anchorByState)) if (!states.includes(state)) throw new Error(`Anchor state chưa được duyệt: ${state}`);
  for (const item of [...draft.midgroundItems, ...draft.foregroundProps]) await resolve(item.ref);
  if (forExport && Object.keys(draft.assetFingerprints).some(key => !assets[key])) throw new Error("Fingerprint chứa asset không còn được dùng; resolve lại lab");
  draft.assetFingerprints = Object.fromEntries(Object.entries(assets).map(([key, asset]) => [key, asset.hash]));
  if (!states.includes("walk")) warnings.push("Chưa có state walk; walk/run dùng ảnh base/idle và bob, không tạo chu kỳ tay chân.");
  if (!states.includes("happy") && !states.includes("surprised")) warnings.push("Chưa có happy/surprised; đoạn biểu cảm giữ state gốc.");
  if (!draft.midgroundItems.length) warnings.push("Midground rỗng: đang dùng nền nguyên khối, chưa phải nền đã tách lớp.");
  if (draft.layout.mode === "ground_plane" && !draft.layout.confirmed) warnings.push("Ground layout chưa xác nhận; được preview nhưng chưa được export.");
  const props: ShowcaseProps = { draft, assets, states, warnings, assetMode: "url" };
  return props;
}
