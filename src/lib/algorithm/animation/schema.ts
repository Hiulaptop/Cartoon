import { z } from "zod";

import { AlgorithmAnimationV1Schema, type AlgorithmAnimationV1 } from "@/lib/algorithm/contracts";

// Hợp đồng AlgorithmAnimationV2 (spec animation-engine §5). Mã dùng chung app, worker và bundle Remotion: không import DB/pg/sharp/fs.
export const MAX_CELLS = 12;
export const MARK_STATES = ["considering", "valid", "rejected", "found"] as const;
export type MarkState = (typeof MARK_STATES)[number];

const cellIndex = z.number().int().min(0).max(MAX_CELLS - 1);
const markState = z.enum(MARK_STATES);
const pointerName = z.string().min(1).max(4);

export const AnimationOpSchema = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("pointer.show"), name: pointerName, index: cellIndex, side: z.enum(["above", "below"]).optional() }),
  z.strictObject({ op: z.literal("pointer.move"), name: pointerName, index: cellIndex }),
  z.strictObject({ op: z.literal("pointer.hide"), name: pointerName }),
  z.strictObject({ op: z.literal("cell.mark"), indices: z.array(cellIndex).min(1).max(MAX_CELLS), state: markState }),
  z.strictObject({ op: z.literal("cell.set"), index: cellIndex, value: z.string().min(1).max(8) }),
  z.strictObject({ op: z.literal("cell.swap"), i: cellIndex, j: cellIndex }),
  z.strictObject({ op: z.literal("range.highlight"), from: cellIndex, to: cellIndex, state: markState }),
  z.strictObject({ op: z.literal("note"), text: z.string().min(1).max(60) }),
  z.strictObject({ op: z.literal("clear"), target: z.enum(["marks", "pointers", "note", "all"]) }),
]);
export type AnimationOp = z.infer<typeof AnimationOpSchema>;

export const AlgorithmAnimationV2Schema = z.strictObject({
  version: z.literal(2),
  width: z.literal(1080),
  height: z.literal(1920),
  fps: z.literal(30),
  durationFrames: z.number().int().min(1).max(5400),
  scenes: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    from: z.number().int().min(0).max(5400),
    durationFrames: z.number().int().min(1).max(5400),
    title: z.string().max(300),
    code: z.string().max(10_000),
    array: z.strictObject({
      values: z.array(z.string().min(1).max(8)).min(1).max(MAX_CELLS),
      labels: z.array(z.string().max(4)).max(MAX_CELLS).optional(),
    }).optional(),
    steps: z.array(z.strictObject({
      cueId: z.string().min(1).max(80),
      weight: z.number().int().min(1).max(5).optional(),
      ops: z.array(AnimationOpSchema).min(1).max(8),
    })).max(40),
  })).min(1).max(30),
});
export type AlgorithmAnimationV2 = z.infer<typeof AlgorithmAnimationV2Schema>;
export type AnimationSceneV2 = AlgorithmAnimationV2["scenes"][number];

// Đọc revision animation bất kỳ phiên bản (V1 cũ vẫn xem và render được); sinh mới chỉ tạo V2.
export const AlgorithmAnimationSchema = z.union([AlgorithmAnimationV1Schema, AlgorithmAnimationV2Schema]);
export type AlgorithmAnimation = AlgorithmAnimationV1 | AlgorithmAnimationV2;
export const isAnimationV2 = (animation: AlgorithmAnimation): animation is AlgorithmAnimationV2 => animation.version === 2;
