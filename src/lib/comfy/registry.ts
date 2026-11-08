import { createHash } from "node:crypto";
import { WorkflowReleaseSchema, type WorkflowRelease, type WorkflowRef, type WorkflowSummary, type ImageInputs, type ComfyGraph } from "./contracts";

// Only reviewed local releases belong here; an empty registry intentionally disables generation.
const releases: WorkflowRelease[] = [];
export function canonicalHash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, val]) => [key, canonical(val)])) : item;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
const classes = new Set(["CheckpointLoaderSimple", "CLIPTextEncode", "KSampler", "EmptyLatentImage", "VAEDecode", "SaveImage"]);
export function validateRelease(value: unknown): WorkflowRelease {
  const release = WorkflowReleaseSchema.parse(value);
  if (canonicalHash(release.graph) !== release.ref.sha256) throw new Error("Hash workflow không khớp");
  for (const node of Object.values(release.graph)) if (!classes.has(node.class_type)) throw new Error("Workflow chứa node ngoài allowlist local");
  const expected = { positive: ["CLIPTextEncode", "text"], negative: ["CLIPTextEncode", "text"], seed: ["KSampler", "seed"], width: ["EmptyLatentImage", "width"], height: ["EmptyLatentImage", "height"], batch: ["EmptyLatentImage", "batch_size"], prefix: ["SaveImage", "filename_prefix"] };
  for (const [key, binding] of Object.entries(release.bindings)) {
    const [className, inputName] = expected[key as keyof typeof expected];
    if (release.graph[binding.node]?.class_type !== className || binding.input !== inputName || !(inputName in release.graph[binding.node].inputs)) throw new Error("Binding workflow không hợp lệ");
  }
  if (release.bindings.positive.node === release.bindings.negative?.node || release.graph[release.outputNode]?.class_type !== "SaveImage" || release.bindings.prefix.node !== release.outputNode) throw new Error("Output/binding workflow không hợp lệ");
  if (Object.values(release.graph).filter((node) => node.class_type === "SaveImage").length !== 1) throw new Error("Pilot chỉ hỗ trợ một SaveImage");
  for (const model of release.models) if (release.graph[model.node]?.class_type !== "CheckpointLoaderSimple" || release.graph[model.node].inputs[model.input] !== model.filename || model.input !== "ckpt_name") throw new Error("Model manifest không khớp graph");
  const loaders = Object.entries(release.graph).filter(([, node]) => node.class_type === "CheckpointLoaderSimple");
  if (loaders.some(([id]) => !release.models.some((model) => model.node === id))) throw new Error("Thiếu provenance model");
  for (const node of Object.values(release.graph)) if (node.class_type === "EmptyLatentImage" && node.inputs.batch_size !== 1) throw new Error("Batch phải bằng 1");
  if (release.allowedSizes.some((s) => s.width * s.height > 16000000)) throw new Error("Workflow vượt giới hạn 16M pixel");
  if (release.bindings.width.node !== release.bindings.height.node || release.bindings.width.node !== release.bindings.batch.node) throw new Error("Size/batch phải cùng latent node");
  if (!release.allowedSizes.some((s) => s.width === release.defaultSize.width && s.height === release.defaultSize.height)) throw new Error("Thiếu default size trong allowlist");
  return release;
}
export function listWorkflowReleases(): WorkflowSummary[] { return releases.map(validateRelease).map((r) => ({ ref: r.ref, label: `${r.ref.id} / ${r.ref.revision}` })); }
export function loadWorkflow(ref: WorkflowRef): WorkflowRelease {
  const release = releases.find((r) => r.ref.id === ref.id && r.ref.revision === ref.revision && r.ref.sha256 === ref.sha256);
  if (!release) throw new Error("Chưa có workflow ComfyUI được phát hành");
  return validateRelease(release);
}
export function parameterizeWorkflow(release: WorkflowRelease, inputs: ImageInputs, runId: string): ComfyGraph {
  if (!release.allowedSizes.some((s) => s.width === inputs.width && s.height === inputs.height)) throw new Error("Workflow không hỗ trợ kích thước yêu cầu");
  const graph = structuredClone(release.graph);
  const values = { positive: inputs.positive, negative: inputs.negative, seed: inputs.seed, width: inputs.width, height: inputs.height, batch: 1, prefix: `cartoon_${runId}` };
  for (const [key, binding] of Object.entries(release.bindings)) graph[binding.node].inputs[binding.input] = values[key as keyof typeof values];
  return graph;
}
