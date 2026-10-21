import * as z from "zod";

import { MAX_SUBTITLE_CHARS } from "@/lib/validation/subtitle";

const NAME = "[a-z0-9]+(?:_[a-z0-9]+)*";
const chrRef = z.string().regex(new RegExp(`^@chr_${NAME}$`), "dạng @chr_ten");
const bgRef = z.string().regex(new RegExp(`^@bg_${NAME}(?:\\.${NAME})?$`), "dạng @bg_ten[.trang_thai]");

export const BEAT_ROLES = ["hook", "setup", "escalation", "turn", "punchline", "resolution", "tag"] as const;
export const GAG_KINDS = ["wordplay", "situational", "physical", "callback", "subversion", "absurd"] as const;

const beat = z.strictObject({
  id: z.string().regex(/^b\d{1,2}$/, "id dạng b1, b2…"),
  role: z.enum(BEAT_ROLES),
  summary: z.string().min(5).max(300),
  location: bgRef,
  characters: z.array(chrRef).min(1).max(4),
  lines: z.array(z.strictObject({ speaker: chrRef, text: z.string().min(1).max(MAX_SUBTITLE_CHARS) })).max(12),
  actions: z.array(z.string().min(5).max(200)).max(8),
  gag: z
    .strictObject({ kind: z.enum(GAG_KINDS), setupBeat: z.string().regex(/^b\d{1,2}$/), note: z.string().min(5).max(200) })
    .optional(),
  seconds: z.int().min(3).max(60),
});

// Khuôn kịch bản v1 (hợp đồng dữ liệu, cần duyệt cùng plan M4).
export const scriptSchema = z.strictObject({
  version: z.literal(1),
  title: z.string().min(3).max(100),
  logline: z.string().min(10).max(300),
  targetSeconds: z.int().min(30).max(600),
  beats: z.array(beat).min(3).max(30),
});
export type ScriptV1 = z.output<typeof scriptSchema>;

// Bọc ngoài scripts.content. Khi đang sinh chỉ có meta.
export const scriptContentSchema = z.object({
  meta: z.object({
    assetNames: z.array(z.string()).min(1),
    targetSeconds: z.int().min(30).max(600),
    feedback: z.string().optional(),
  }),
  script: scriptSchema.optional(),
  issues: z.array(z.string()).optional(),
});
export type ScriptContent = z.output<typeof scriptContentSchema>;

export const comboDefinitionSchema = z.object({
  structure: z.array(z.object({ role: z.enum(BEAT_ROLES), minSeconds: z.number(), maxSeconds: z.number(), guidance: z.string() })).min(3),
  hook: z.object({ maxSeconds: z.number(), guidance: z.string() }),
  gagTechniques: z.array(z.object({ kind: z.enum(GAG_KINDS), guidance: z.string() })).min(1),
  tone: z.string(),
  pacing: z.string(),
  minGags: z.int().min(0),
});
export type ComboDefinition = z.output<typeof comboDefinitionSchema>;
