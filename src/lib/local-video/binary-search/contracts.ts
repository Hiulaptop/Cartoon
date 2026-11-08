import { z } from "zod";

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const frame = z.number().int().nonnegative();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const ExampleSchema = z.enum(["small-found", "million-found", "small-missing"]);
export type Example = z.infer<typeof ExampleSchema>;
export const VisualSchema = z.strictObject({
  kind: z.enum(["hook", "linear", "small-search", "large-search", "halving", "sorted-rule", "not-found", "closing"]),
  example: ExampleSchema.optional(),
  beats: z.array(z.strictObject({ at: z.number().min(0).lt(1), stateIndex: frame, phase: z.enum(["initial", "before", "after"]) })).max(40),
});
export const CueSchema = z.strictObject({
  id, chapterId: id, text: z.string().min(1).max(400),
  captionSegments: z.array(z.string().min(1)).min(1), visual: VisualSchema,
});
export const EpisodeDefinitionSchema = z.strictObject({
  version: z.literal(1), id: z.literal("binary-search-english-v1"), title: z.string().min(1),
  chapters: z.array(z.strictObject({ id, title: z.string().min(1) })).length(5),
  cues: z.array(CueSchema).min(1).max(48),
});
export type EpisodeDefinition = z.infer<typeof EpisodeDefinitionSchema>;
export type EpisodeCue = EpisodeDefinition["cues"][number];
export const VoiceRequestSchema = z.strictObject({
  version: z.literal(1), requestId: id, language: z.literal("English"), speaker: z.literal("Ryan"), fps: z.literal(30),
  cues: z.array(z.strictObject({ id, text: z.string().min(1).max(400), preset: z.enum(["engaging-hook", "clear-explainer"]), seed: z.number().int().min(0).max(4294967295) })).min(1).max(24),
});
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;
export const SearchStepSchema = z.strictObject({
  ordinal: z.number().int().positive(), lo: frame, hi: frame, mid: frame, value: z.number().finite(),
  relation: z.enum(["less", "equal", "greater"]), remainingBefore: z.number().int().positive(),
  nextLo: frame, nextHi: z.number().int().min(-1), remainingAfter: frame,
});
export type SearchStep = z.infer<typeof SearchStepSchema>;
export const SearchTraceSchema = z.strictObject({
  length: z.number().int().positive(), target: z.number().finite(), steps: z.array(SearchStepSchema).min(1), foundIndex: frame.nullable(),
});
export type SearchTrace = z.infer<typeof SearchTraceSchema>;
export const CaptionSchema = z.strictObject({ from: frame, to: frame, text: z.string().min(1), lines: z.array(z.string().min(1).max(42)).min(1).max(2), timing: z.literal("estimated") });
export type Caption = z.infer<typeof CaptionSchema>;
export const PreparedCueSchema = CueSchema.extend({
  from: frame, durationInFrames: z.number().int().positive(), audioStartFrame: frame, audioFrames: z.number().int().positive(),
  src: z.string().regex(/^audio\/[A-Za-z0-9_-]{1,64}\.wav$/), wavSha256: hash, fingerprint: hash,
});
export const ProvenanceSchema = z.strictObject({
  contentHashes: z.record(z.string(), hash),
  assets: z.array(z.strictObject({ src: z.string(), sha256: hash })),
  voice: z.array(z.strictObject({ requestId: id, completeSha256: hash, manifestSha256: hash, timelineSha256: hash })),
  captionTiming: z.literal("estimated-character-weighted-not-word-aligned"),
});
export const PreparedEpisodeSchema = z.strictObject({
  version: z.literal(1), id: z.literal("binary-search-english-v1"), title: z.string().min(1),
  fps: z.literal(30), width: z.literal(1920), height: z.literal(1080), durationInFrames: z.number().int().positive(),
  chapters: EpisodeDefinitionSchema.shape.chapters,
  cues: z.array(PreparedCueSchema).min(1).max(48), captions: z.array(CaptionSchema).min(1),
  traces: z.strictObject({ "small-found": SearchTraceSchema, "million-found": SearchTraceSchema, "small-missing": SearchTraceSchema }),
  provenance: ProvenanceSchema,
});
export type PreparedEpisode = z.infer<typeof PreparedEpisodeSchema>;
export type PreparedCue = PreparedEpisode["cues"][number];
