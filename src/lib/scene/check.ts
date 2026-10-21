import { isAllowedState } from "@/lib/assets/naming";

import type { Catalog } from "./catalog";
import { assetKey, defaultState, parseRef } from "./refs";
import type { ResolvedAssets, SceneDsl } from "./schema";

// Kiểm tra máy lớp 1 cho cảnh (spec §6): cấu trúc + tham chiếu asset. Không dùng LLM.
export function checkSceneDsl(dsl: SceneDsl, catalog: Catalog): { issues: string[]; assets: ResolvedAssets } {
  const issues: string[] = [];
  const assets: ResolvedAssets = {};
  const end = dsl.durationFrames;

  function resolveAsset(where: string, raw: string, explicitState?: string) {
    const ref = parseRef(raw);
    if (!ref) return issues.push(`${where}: tham chiếu sai chuẩn "${raw}"`);
    const asset = catalog.get(ref.name);
    if (!asset) return issues.push(`${where}: ${raw} không phải asset đã duyệt`);
    const state = explicitState ?? ref.state ?? defaultState(ref.kind);
    if (!isAllowedState(ref.kind, state)) return issues.push(`${where}: trạng thái "${state}" không hợp lệ cho ${ref.kind}`);
    const variant = asset.variants.get(state);
    if (!variant) return issues.push(`${where}: ${ref.name}.${state} chưa có ảnh đã duyệt (cần sinh và duyệt biến thể)`);
    assets[assetKey(ref.name, state)] = variant;
  }

  function inRange(where: string, from: number, to: number) {
    if (from >= to) issues.push(`${where}: from (${from}) phải nhỏ hơn to (${to})`);
    if (to > end) issues.push(`${where}: to (${to}) vượt durationFrames (${end})`);
  }

  const ids = new Set<string>();
  const unique = (id: string, where: string) => {
    if (ids.has(id)) issues.push(`${where}: id "${id}" bị trùng`);
    ids.add(id);
  };

  resolveAsset("background", dsl.background.ref);

  dsl.characters.forEach((c, i) => {
    const where = `characters[${i}] (${c.id})`;
    unique(c.id, where);
    if (c.states[0].at !== 0) issues.push(`${where}: states[0].at phải bằng 0`);
    c.states.forEach((s, k) => {
      if (k > 0 && s.at <= c.states[k - 1].at) issues.push(`${where}: states[${k}].at phải lớn hơn khóa trước`);
      if (s.at >= end) issues.push(`${where}: states[${k}].at (${s.at}) ngoài cảnh`);
      resolveAsset(`${where}.states[${k}]`, c.ref, s.state);
    });
    // Trạng thái nói được dựng tự động nếu đủ cả hai ảnh; không ép phải có.
    for (const talk of ["talk_a", "talk_b"]) {
      const asset = catalog.get(c.ref.slice(1));
      const variant = asset?.variants.get(talk);
      if (variant) assets[assetKey(c.ref.slice(1), talk)] = variant;
    }
    c.moves.forEach((m, k) => {
      inRange(`${where}.moves[${k}]`, m.from, m.to);
      if (k > 0 && m.from < c.moves[k - 1].to) issues.push(`${where}.moves[${k}]: chồng lên chuyển động trước`);
    });
  });

  for (const [list, items] of [["props", dsl.props], ["effects", dsl.effects]] as const) {
    items.forEach((it, i) => {
      const where = `${list}[${i}] (${it.id})`;
      unique(it.id, where);
      inRange(where, it.from, it.to);
      resolveAsset(where, it.ref);
    });
  }

  const speakers = new Set(dsl.characters.map((c) => c.id));
  const lines = [...dsl.dialogue].sort((a, b) => a.from - b.from);
  dsl.dialogue.forEach((d, i) => {
    const where = `dialogue[${i}]`;
    inRange(where, d.from, d.to);
    if (!speakers.has(d.speaker)) issues.push(`${where}: speaker "${d.speaker}" không có trong characters`);
  });
  lines.forEach((d, i) => {
    if (i > 0 && d.from < lines[i - 1].to) issues.push(`dialogue: câu "${d.text.slice(0, 20)}…" chồng lên câu trước`);
  });

  dsl.camera.forEach((k, i) => {
    if (k.at >= end) issues.push(`camera[${i}].at (${k.at}) ngoài cảnh`);
    if (i > 0 && k.at <= dsl.camera[i - 1].at) issues.push(`camera[${i}].at phải lớn hơn khóa trước`);
  });

  if (dsl.transition.frames * 2 > end) issues.push("transition.frames * 2 vượt durationFrames");

  return { issues, assets };
}
