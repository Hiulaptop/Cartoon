// Chuẩn đặt tên asset (docs/standards/asset-naming.md). Sửa quy ước thì sửa cả hai nơi.

export const ASSET_KINDS = ["chr", "bg", "prop", "fx"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const KIND_LABELS: Record<AssetKind, string> = {
  chr: "Nhân vật",
  bg: "Bối cảnh",
  prop: "Đạo cụ",
  fx: "Hiệu ứng",
};

export const STATES_BY_KIND: Record<AssetKind, readonly string[]> = {
  chr: ["base", "idle", "talk_a", "talk_b", "happy", "sad", "angry", "surprised", "walk"],
  bg: ["base", "day", "night", "rain"],
  prop: ["base", "broken"],
  fx: ["base"],
};

const NAME_RE = /^(chr|bg|prop|fx)_[a-z0-9]+(_[a-z0-9]+)*$/;
const MAX_NAME_LENGTH = 40;

export function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value);
}

// Trả về lý do sai, hoặc null nếu tên hợp lệ với loại asset.
export function assetNameError(name: string, kind: AssetKind): string | null {
  if (!NAME_RE.test(name)) return "Chỉ dùng chữ thường không dấu, số, `_`, bắt đầu bằng chr_/bg_/prop_/fx_";
  if (name.length > MAX_NAME_LENGTH) return `Tối đa ${MAX_NAME_LENGTH} ký tự`;
  if (!name.startsWith(`${kind}_`)) return `Tên phải bắt đầu bằng ${kind}_`;
  return null;
}

export function isAllowedState(kind: AssetKind, state: string): boolean {
  return STATES_BY_KIND[kind].includes(state);
}

// Biến chuỗi bất kỳ (LLM đề xuất) thành tên hợp lệ nhất có thể; vẫn phải kiểm tra lại bằng assetNameError.
export function toAssetName(raw: string, kind: AssetKind): string {
  const slug = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/^(chr|bg|prop|fx)_/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${kind}_${slug || "asset"}`.slice(0, MAX_NAME_LENGTH).replace(/_+$/, "");
}
