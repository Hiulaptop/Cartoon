import { isAllowedState } from "@/lib/assets/naming";
import type { Catalog } from "@/lib/scene/catalog";

import type { CastingV1 } from "./schema";

export type CastingContext = {
  // Asset đã duyệt của bộ phim (tên -> loại, biến thể đã duyệt).
  catalog: Catalog;
  // Biến thể đang sinh hoặc chờ duyệt ("tên.trạng_thái"): không đề xuất lại để khỏi ghi đè.
  inFlight: Set<string>;
};

// Kiểm tra máy lớp 1 cho đề xuất casting. Đề xuất sai bị loại (kèm lý do), phần đúng vẫn dùng được.
export function checkCasting(c: CastingV1, ctx: CastingContext): { result: CastingV1; issues: string[] } {
  const issues: string[] = [];

  const useAssets = [...new Set(c.useAssets)].filter((name) => {
    if (ctx.catalog.has(name)) return true;
    issues.push(`useAssets: ${name} không phải asset đã duyệt của bộ phim`);
    return false;
  });

  const keys = new Set<string>();
  const newAssets = c.newAssets
    .filter((a) => {
      if (keys.has(a.key)) {
        issues.push(`newAssets: key "${a.key}" bị trùng`);
        return false;
      }
      keys.add(a.key);
      return true;
    })
    .map((a) => {
      const states = [...new Set(a.states)].filter((s) => {
        if (s !== "base" && isAllowedState(a.kind, s)) return true;
        issues.push(`newAssets[${a.key}]: trạng thái "${s}" không hợp lệ cho ${a.kind}`);
        return false;
      });
      return { ...a, states };
    });

  // Trả lý do loại, hoặc null nếu đề xuất biến thể hợp lệ.
  const variantIssue = (v: CastingV1["newVariants"][number]): string | null => {
    const key = `${v.asset}.${v.state}`;
    const asset = ctx.catalog.get(v.asset);
    if (!asset) return `newVariants: ${v.asset} không phải asset đã duyệt của bộ phim`;
    if (v.state === "base" || !isAllowedState(asset.kind, v.state)) return `newVariants: trạng thái "${v.state}" không hợp lệ cho ${asset.kind}`;
    if (asset.variants.has(v.state)) return `newVariants: ${key} đã có ảnh đã duyệt`;
    if (ctx.inFlight.has(key)) return `newVariants: ${key} đang được sinh hoặc chờ duyệt`;
    return null;
  };
  const seen = new Set<string>();
  const newVariants = c.newVariants.filter((v) => {
    const key = `${v.asset}.${v.state}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const issue = variantIssue(v);
    if (issue) issues.push(issue);
    return issue === null;
  });

  return { result: { version: 1, useAssets, newAssets, newVariants }, issues };
}
