import { ASSET_KINDS, type AssetKind } from "@/lib/assets/naming";

export type ParsedRef = { name: string; kind: AssetKind; state: string | null };

const REF_RE = /^@((chr|bg|prop|fx)_[a-z0-9]+(?:_[a-z0-9]+)*)(?:\.([a-z0-9]+(?:_[a-z0-9]+)*))?$/;

// "@chr_minh.happy" -> { name: "chr_minh", kind: "chr", state: "happy" }. Sai chuẩn thì null.
export function parseRef(raw: string): ParsedRef | null {
  const m = REF_RE.exec(raw);
  if (!m) return null;
  const kind = m[2] as AssetKind;
  if (!ASSET_KINDS.includes(kind)) return null;
  return { name: m[1], kind, state: m[3] ?? null };
}

// Khóa của bản đồ ảnh đã phân giải: "chr_minh.happy".
export function assetKey(name: string, state: string): string {
  return `${name}.${state}`;
}

// Chuẩn đặt tên: không ghi state nghĩa là idle với chr, base với các loại khác.
export function defaultState(kind: AssetKind): string {
  return kind === "chr" ? "idle" : "base";
}

// id nhân vật trong cảnh: tên asset bỏ "chr_", tối đa 24 ký tự, bắt đầu bằng chữ. Prompt (M5) và sample dùng chung.
export function characterId(refOrName: string): string {
  const name = refOrName.replace(/^@/, "").replace(/^chr_/, "").slice(0, 24);
  return /^[a-z]/.test(name) ? name : `c${name}`.slice(0, 24);
}
