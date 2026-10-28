import * as z from "zod";
import { polygonIssue } from "./ground";

const unit = z.number().min(0).max(1);
const point = z.strictObject({ x: unit, y: unit });
const height = z.number().min(0.1).max(1.2);
const ref = z.string().max(100).regex(/^@(bg|chr|prop|fx)_[a-z0-9_]+(?:\.[a-z0-9_]+)?$/);
export const motionKinds = ["idle_bob", "walk_bob", "run_bob", "hop", "recoil", "squash"] as const;
const clip = z.strictObject({ kind: z.enum(motionKinds), from: z.int().min(0).max(599), to: z.int().min(1).max(600) });
const flat = z.strictObject({ mode: z.literal("flat"), referenceFoot: point, referenceHeight: height });
const ground = z.strictObject({
  mode: z.literal("ground_plane"), referenceFoot: point, referenceHeight: height,
  horizonY: unit, epsilon: z.number().min(0.001).max(0.15), confirmed: z.boolean(),
  nearFoot: point, farFoot: point,
  standingRegions: z.array(z.array(point).min(3).max(16)).min(1).max(4),
});
export const layoutSchema = z.discriminatedUnion("mode", [flat, ground]);
export const itemSchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/), ref, x: unit, y: unit, height,
  anchor: point.default({ x: 0.5, y: 1 }), flip: z.boolean().default(false),
  clips: z.array(clip).max(12).default([]),
});
export const draftSchema = z.strictObject({
  presetVersion: z.literal(1), seriesId: z.uuid(),
  backgroundRef: ref.regex(/^@bg_/), characterRef: ref.regex(/^@chr_[a-z0-9_]+$/),
  midgroundItems: z.array(itemSchema).max(8).default([]), foregroundProps: z.array(itemSchema).max(4).default([]),
  layout: layoutSchema, anchorByState: z.record(z.string().regex(/^[a-z0-9_]+$/), point).default({}),
  intensity: z.enum(["subtle", "normal", "strong"]).default("normal"), debug: z.boolean().default(true),
  assetFingerprints: z.record(z.string().max(100), z.string().regex(/^[a-f0-9]{64}$/)).default({}),
}).superRefine((draft, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const ids = new Set<string>(["main"]);
  for (const [layer, items] of [["midground", draft.midgroundItems], ["foreground", draft.foregroundProps]] as const) {
    for (const item of items) {
      if (ids.has(item.id)) fail(`ID trùng: ${item.id}`);
      ids.add(item.id);
      if (layer === "midground" && (!/^@(prop|chr)_/.test(item.ref) || item.clips.length)) fail(`${item.id}: midground chỉ nhận prop/chr tĩnh`);
      if (layer === "foreground" && !/^@prop_/.test(item.ref)) fail(`${item.id}: foreground prop phải là @prop_`);
      let last = -1;
      for (const c of item.clips) {
        if (c.to - c.from < 3 || c.from < last) fail(`${item.id}: clip phải dài >=3 frame, có thứ tự và không overlap`);
        if (c.kind === "walk_bob" || c.kind === "run_bob") fail(`${item.id}: prop chưa có đường đi, không dùng walk/run bob`);
        last = c.to;
      }
    }
  }
  if (draft.layout.mode === "ground_plane") {
    const l = draft.layout;
    if (l.referenceFoot.y - l.horizonY <= l.epsilon) fail("Reference foot phải ở trước horizon + epsilon");
    l.standingRegions.forEach((p, i) => { const issue = polygonIssue(p); if (issue) fail(`Vùng đứng ${i + 1}: ${issue}`); });
  }
});

export function initialDraft(seriesId: string, backgroundRef: string, characterRef: string) {
  return draftSchema.parse({ presetVersion: 1, seriesId, backgroundRef, characterRef,
    layout: { mode: "flat", referenceFoot: { x: 0.5, y: 0.87 }, referenceHeight: 0.32 } });
}
