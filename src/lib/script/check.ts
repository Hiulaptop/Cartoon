import { isAllowedState } from "@/lib/assets/naming";
import type { Catalog } from "@/lib/scene/catalog";
import { parseRef } from "@/lib/scene/refs";
import { estimateLineSeconds } from "@/lib/validation/subtitle";

import type { ComboDefinition, ScriptV1 } from "./schema";

const TOLERANCE = 0.15; // tổng thời lượng lệch tối đa ±15% so với mục tiêu
const GAP_SECONDS = 0.4; // khoảng nghỉ giữa hai câu thoại

// Kiểm tra máy lớp 1 cho kịch bản (spec §6). Trả danh sách lỗi; rỗng = đạt.
export function checkScript(script: ScriptV1, catalog: Catalog, combo: ComboDefinition): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const index = new Map(script.beats.map((b, i) => [b.id, i]));

  const checkRef = (where: string, raw: string, kind: "chr" | "bg") => {
    const ref = parseRef(raw);
    const asset = ref && catalog.get(ref.name);
    if (!ref || ref.kind !== kind) return issues.push(`${where}: "${raw}" sai chuẩn tham chiếu`);
    if (!asset) return issues.push(`${where}: ${raw} không phải asset đã duyệt`);
    if (ref.state && !isAllowedState(ref.kind, ref.state)) issues.push(`${where}: trạng thái "${ref.state}" không hợp lệ`);
    else if (ref.state && !asset.variants.has(ref.state)) issues.push(`${where}: ${ref.name}.${ref.state} chưa có ảnh đã duyệt`);
  };

  script.beats.forEach((b, i) => {
    const where = `beats[${i}] (${b.id})`;
    if (ids.has(b.id)) issues.push(`${where}: id bị trùng`);
    ids.add(b.id);
    checkRef(`${where}.location`, b.location, "bg");
    b.characters.forEach((c, k) => checkRef(`${where}.characters[${k}]`, c, "chr"));
    b.lines.forEach((l, k) => {
      if (!b.characters.includes(l.speaker)) issues.push(`${where}.lines[${k}]: ${l.speaker} không có trong characters của nhịp`);
    });
    const needed = b.lines.reduce((sum, l) => sum + estimateLineSeconds(l.text) + GAP_SECONDS, 0);
    if (needed > b.seconds) {
      issues.push(`${where}: thoại cần ít nhất ${needed.toFixed(1)}s để đọc kịp nhưng nhịp chỉ có ${b.seconds}s`);
    }
    if (b.gag) {
      const setup = index.get(b.gag.setupBeat);
      if (setup === undefined) issues.push(`${where}.gag: setupBeat "${b.gag.setupBeat}" không tồn tại`);
      else if (setup > i) issues.push(`${where}.gag: setupBeat phải đứng trước hoặc là chính nhịp này`);
    }
  });

  const first = script.beats[0];
  if (first.role !== "hook") issues.push("Nhịp đầu tiên phải có role hook");
  else if (first.seconds > combo.hook.maxSeconds) issues.push(`Hook dài ${first.seconds}s, tối đa ${combo.hook.maxSeconds}s`);

  const total = script.beats.reduce((s, b) => s + b.seconds, 0);
  if (Math.abs(total - script.targetSeconds) > script.targetSeconds * TOLERANCE) {
    issues.push(`Tổng thời lượng ${total}s lệch quá ±15% so với mục tiêu ${script.targetSeconds}s`);
  }
  const gags = script.beats.filter((b) => b.gag).length;
  if (gags < combo.minGags) issues.push(`Cần ít nhất ${combo.minGags} miếng hài (gag), mới có ${gags}`);

  return issues;
}
