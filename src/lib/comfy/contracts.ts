import { z } from "zod";

export const RUN_STATES = ["prepared", "submitting", "submitted", "succeeded", "failed", "uncertain", "abandoned", "stale"] as const;
export const ACTIVE_STATES = ["prepared", "submitting", "submitted", "uncertain"] as const;
export type ComfyRunState = typeof RUN_STATES[number];
export type ImageBackend = "9router" | "comfyui";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,79}$/);
export const WorkflowRefSchema = z.strictObject({ id: name, revision: name, sha256: hash });
export type WorkflowRef = z.infer<typeof WorkflowRefSchema>;
export const SizeSchema = z.strictObject({ width: z.number().int().min(64).max(4096), height: z.number().int().min(64).max(4096) });
export const ImageInputsSchema = SizeSchema.extend({ positive: z.string().min(1).max(20000), negative: z.string().max(10000), seed: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) });
export type ImageInputs = z.infer<typeof ImageInputsSchema>;
export const GraphSchema = z.record(z.string().regex(/^\d+$/), z.strictObject({ class_type: z.string().min(1), inputs: z.record(z.string(), z.unknown()), _meta: z.object({ title: z.string().optional() }).passthrough().optional() }));
export type ComfyGraph = z.infer<typeof GraphSchema>;
const binding = z.strictObject({ node: z.string().regex(/^\d+$/), input: z.string().min(1) });
export const WorkflowReleaseSchema = z.strictObject({
  version: z.literal(1), ref: WorkflowRefSchema, expectedComfyVersion: z.string().min(1), graph: GraphSchema,
  bindings: z.strictObject({ positive: binding, negative: binding.optional(), seed: binding, width: binding, height: binding, batch: binding, prefix: binding }),
  outputNode: z.string().regex(/^\d+$/), defaultSize: SizeSchema, allowedSizes: z.array(SizeSchema).min(1).max(20),
  models: z.array(z.strictObject({ node: z.string(), input: z.string(), filename: z.string().min(1), sha256: hash, source: z.url(), licenseNote: z.string().min(1) })).min(1),
});
export type WorkflowRelease = z.infer<typeof WorkflowReleaseSchema>;
export type WorkflowSummary = { ref: WorkflowRef; label: string };
export const ArtifactSchema = z.strictObject({ path: z.string().min(1), sha256: hash, bytes: z.number().int().positive(), width: z.number().int().positive(), height: z.number().int().positive() });
export type ComfyArtifact = z.infer<typeof ArtifactSchema>;
export const RunSnapshotSchema = z.strictObject({ version: z.literal(1), release: WorkflowReleaseSchema, inputs: ImageInputsSchema, graph: GraphSchema, graphHash: hash, endpointHash: hash, clientId: z.uuid(), kind: z.enum(["chr", "bg", "prop", "fx"]) });
export type RunSnapshot = z.infer<typeof RunSnapshotSchema>;
export type ComfyOutput = { filename: string; subfolder: string; type: "output" };
export type PromptObservation = { state: "queued" | "running" | "completed" | "failed" | "missing"; output?: ComfyOutput };
export type ComfyRunView = { id: string; variantId: string; state: ComfyRunState; jobStatus: string; promptId: string | null; workflow: string; model: string; size: string; error: string | null; updatedAt: string };
