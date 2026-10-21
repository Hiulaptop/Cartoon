import * as z from "zod";

// Khuôn JSON cảnh v1. Sửa khuôn = bump version + được duyệt (AGENTS.md luật 3).
export const SCENE_DSL_VERSION = 1;
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const MAX_SCENE_FRAMES = FPS * 30;

const NAME = "[a-z0-9]+(?:_[a-z0-9]+)*";
const id = z.string().regex(/^[a-z][a-z0-9_]{0,23}$/, "id: chữ thường, số, _; bắt đầu bằng chữ; tối đa 24 ký tự");
const frame = z.int().min(0).max(MAX_SCENE_FRAMES);
const coord = z.number().min(-0.5).max(1.5);
const stateName = z.string().regex(new RegExp(`^${NAME}$`));
const refWithState = (kind: "bg" | "prop" | "fx") =>
  z.string().regex(new RegExp(`^@${kind}_${NAME}(?:\\.${NAME})?$`), `ref phải dạng @${kind}_ten hoặc @${kind}_ten.trang_thai`);

const character = z.strictObject({
  id,
  ref: z.string().regex(new RegExp(`^@chr_${NAME}$`), "ref nhân vật không ghi trạng thái: @chr_ten"),
  x: coord,
  y: coord,
  height: z.number().min(0.1).max(1.2),
  flip: z.boolean().default(false),
  states: z.array(z.strictObject({ at: frame, state: stateName })).min(1),
  moves: z.array(z.strictObject({ from: frame, to: frame, x: coord, y: coord })).default([]),
});

const item = (kind: "prop" | "fx") =>
  z.strictObject({ id, ref: refWithState(kind), x: coord, y: coord, height: z.number().min(0.05).max(1.2), from: frame, to: frame });

const dialogue = z.strictObject({
  speaker: id,
  // 84 = 2 dòng × 42 ký tự (Netflix English Timed Text Style Guide), xem M4.
  text: z.string().min(1).max(84),
  from: frame,
  to: frame,
});

const cameraKey = z.strictObject({
  at: frame,
  zoom: z.number().min(1).max(2.5),
  fx: z.number().min(0).max(1),
  fy: z.number().min(0).max(1),
});

export const sceneDslSchema = z.strictObject({
  version: z.literal(SCENE_DSL_VERSION),
  durationFrames: z.int().min(FPS).max(MAX_SCENE_FRAMES),
  background: z.strictObject({ ref: refWithState("bg") }),
  characters: z.array(character).max(4),
  props: z.array(item("prop")).max(8).default([]),
  effects: z.array(item("fx")).max(4).default([]),
  dialogue: z.array(dialogue).max(12).default([]),
  camera: z.array(cameraKey).min(1).default([{ at: 0, zoom: 1, fx: 0.5, fy: 0.5 }]),
  transition: z
    .strictObject({
      in: z.enum(["cut", "fade"]),
      out: z.enum(["cut", "fade"]),
      frames: z.int().min(6).max(30),
    })
    .default({ in: "cut", out: "cut", frames: 12 }),
});

export type SceneDsl = z.output<typeof sceneDslSchema>;
export type SceneCharacter = SceneDsl["characters"][number];
export type SceneItem = SceneDsl["props"][number];
export type SceneDialogue = SceneDsl["dialogue"][number];

// Ảnh đã phân giải theo khóa "chr_minh.happy". `path` tính từ DATA_DIR.
export type ResolvedAsset = { path: string; width: number; height: number };
export type ResolvedAssets = Record<string, ResolvedAsset>;

export function parseSceneDsl(input: unknown): { ok: true; dsl: SceneDsl } | { ok: false; issues: string[] } {
  const result = sceneDslSchema.safeParse(input);
  if (result.success) return { ok: true, dsl: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(gốc)"}: ${i.message}`),
  };
}
