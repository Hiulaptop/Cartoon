import { z } from "zod";

export const FORMAT = { width: 1920, height: 1080, fps: 30 } as const;
export const STAGES = ["brief", "research", "storyboard", "production", "final", "complete"] as const;
export const RUN_STAGES = ["research", "storyboard", "preview", "audio", "render", "package"] as const;
export type Stage = (typeof STAGES)[number];
export type RunStage = (typeof RUN_STAGES)[number];
export type Issue = { code: string; path: string; message: string; severity: "blocker" | "warning" };
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1);
export const BriefSchema = z.strictObject({ question: text.max(500), angle: z.string().max(2000), avoid: z.string().max(2000), urls: z.array(z.url().max(2000)).max(6) });
export type Brief = z.infer<typeof BriefSchema>;
export const ProfileSchema = z.strictObject({
  version: z.literal(1), language: text.max(40), audience: text.max(500), tone: text.max(500), avoid: z.string().max(2000),
  model: z.string().max(200), voice: z.string().max(200), allowedHosts: z.array(z.string().regex(/^[a-z0-9.-]+$/).max(253)).max(30),
  currency: z.string().regex(/^[A-Z]{3}$/), runLimit: z.number().finite().nonnegative(), videoLimit: z.number().finite().nonnegative(), monthlyLimit: z.number().finite().nonnegative(),
  accessConfirmed: z.boolean(), licensesConfirmed: z.boolean(),
});
export type Profile = z.infer<typeof ProfileSchema>;
export const DEFAULT_PROFILE: Profile = { version: 1, language: "Tiếng Việt", audience: "Người trưởng thành tò mò, không cần nền tảng chuyên môn", tone: "Rõ ràng, gần gũi; giải thích cơ chế và giới hạn", avoid: "Y tế, đầu tư, pháp lý; khẳng định không có bằng chứng", model: "", voice: "", allowedHosts: [], currency: "USD", runLimit: 0, videoLimit: 0, monthlyLimit: 0, accessConfirmed: false, licensesConfirmed: false };
export const EvidenceSchema = z.strictObject({ sourceId: z.uuid(), sourceHash: hash, start: z.number().int().nonnegative(), end: z.number().int().positive(), quote: text.max(1500) });
export const ResearchSchema = z.strictObject({
  version: z.literal(1), answer: text.max(3000), scope: text.max(2000), limitations: z.array(text.max(1000)).max(20),
  claims: z.array(z.strictObject({ id, kind: z.enum(["fact", "inference", "assumption"]), text: text.max(1500), central: z.boolean(), evidence: z.array(EvidenceSchema).max(6), dependsOnClaimIds: z.array(id).max(20) })).min(1).max(40),
  unresolved: z.array(text.max(1000)).max(20), visualAngles: z.array(text.max(1000)).max(12),
});
export type Research = z.infer<typeof ResearchSchema>;
const targetOp = <T extends string>(op: T) => z.strictObject({ op: z.literal(op), target: id });
export const OperationSchema = z.discriminatedUnion("op", [
  targetOp("object.show"), targetOp("object.hide"), targetOp("object.highlight"),
  z.strictObject({ op: z.literal("object.move"), target: id, slot: z.number().int().min(0).max(7) }),
  z.strictObject({ op: z.literal("flow.emit"), target: id, to: id }),
  z.strictObject({ op: z.literal("queue.enqueue"), target: id, label: text.max(20) }),
  targetOp("queue.serve"),
  z.strictObject({ op: z.literal("counter.set"), target: id, value: z.number().finite().min(-1e9).max(1e9), unit: z.string().max(20) }),
  z.strictObject({ op: z.literal("callout.show"), target: id, text: text.max(160) }), targetOp("callout.hide"),
]);
export const StoryboardSchema = z.strictObject({
  version: z.literal(1), title: text.max(200), previewSceneId: id,
  scenes: z.array(z.strictObject({
    id, title: text.max(120), layout: z.enum(["flow", "queue", "compare", "callout"]), assumptions: z.array(text.max(180)).max(3),
    objects: z.array(z.strictObject({ id, type: z.enum(["person", "device", "router", "server", "parcel", "desk"]), label: text.max(80), slot: z.number().int().min(0).max(7) })).min(1).max(8),
    cues: z.array(z.strictObject({ id, text: text.max(300), spokenText: text.max(500), claimIds: z.array(id).max(10), weight: z.number().int().min(1).max(5),
      operations: z.array(z.strictObject({ from: z.number().min(0).max(1), to: z.number().min(0).max(1), action: OperationSchema })).max(16),
    })).min(1).max(20),
  })).min(1).max(24),
});
export type Storyboard = z.infer<typeof StoryboardSchema>;
export type Scene = Storyboard["scenes"][number];
export type Cue = Scene["cues"][number];
export type Operation = z.infer<typeof OperationSchema>;
export const ClipSchema = z.strictObject({ cueId: id, fingerprint: hash, filePath: text, sha256: hash, durationSeconds: z.number().positive().finite() });
export type Clip = z.infer<typeof ClipSchema>;
export const TimelineCueSchema = z.strictObject({ sceneId: id, cueId: id, text: text.max(300), from: z.number().int().nonnegative(), duration: z.number().int().positive(), filePath: text });
export type TimelineCue = z.infer<typeof TimelineCueSchema>;
export const RenderInputSchema = z.strictObject({ version: z.literal(1), storyboard: StoryboardSchema, cues: z.array(TimelineCueSchema).min(1).max(120), durationFrames: z.number().int().positive(), assetMode: z.enum(["url", "static"]) });
export type RenderInput = z.infer<typeof RenderInputSchema>;
export const FileSchema = z.strictObject({ id, name: text.max(100), path: text, sha256: hash, bytes: z.number().int().nonnegative(), mime: text.max(100) });
export type OutputFile = z.infer<typeof FileSchema>;
export const MetadataSchema = z.strictObject({ title: text.max(100), description: text.max(5000), chapters: z.array(z.strictObject({ seconds: z.number().int().nonnegative(), title: text.max(120) })).max(24), disclosureReminder: z.string().max(1000) });
export const BundleSchema = z.strictObject({ version: z.literal(1), storyboardId: z.uuid(), storyboardHash: hash, durationFrames: z.number().int().positive(), metadata: MetadataSchema, files: z.array(FileSchema).min(6).max(12), durationException: z.string().max(1000) });
export type Bundle = z.infer<typeof BundleSchema>;
export type ExpectedHead = { videoId: string; lockVersion: number };
export type ActionResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string };
export const PermitSchema = z.strictObject({ maxCalls: z.number().int().min(1).max(130), unknownCostAcknowledged: z.literal(true) });
export type Permit = z.infer<typeof PermitSchema>;
