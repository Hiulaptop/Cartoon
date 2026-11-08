import { z } from "zod";
import type { ComfyConfig } from "./config";
import type { WorkflowRelease } from "./contracts";
import { readComfyJson } from "./client";

export class ComfyPreflightRejectedError extends Error {}

export async function readCapabilities(config: ComfyConfig, release: WorkflowRelease, signal: AbortSignal): Promise<void> {
  if (!config.enabled) throw new ComfyPreflightRejectedError("ComfyUI đang tắt");
  const stats = z.object({ system: z.object({ comfyui_version: z.string() }) }).parse(await readComfyJson(config, "/system_stats", signal));
  if (stats.system.comfyui_version !== release.expectedComfyVersion) throw new ComfyPreflightRejectedError("Phiên bản ComfyUI khác bản workflow được nghiệm thu");
  const definitions = new Map<string, { required: Record<string, unknown>; optional?: Record<string, unknown> }>();
  for (const node of Object.values(release.graph)) {
    if (!definitions.has(node.class_type)) {
      const response = z.record(z.string(), z.object({ input: z.object({ required: z.record(z.string(), z.unknown()), optional: z.record(z.string(), z.unknown()).optional() }) }).passthrough()).parse(await readComfyJson(config, `/object_info/${encodeURIComponent(node.class_type)}`, signal));
      if (!response[node.class_type]) throw new ComfyPreflightRejectedError("Thiếu node workflow");
      definitions.set(node.class_type, response[node.class_type].input);
    }
    const definition = definitions.get(node.class_type)!;
    for (const input of Object.keys(node.inputs)) if (!(input in definition.required) && !(input in (definition.optional ?? {}))) throw new ComfyPreflightRejectedError("Input node khác phiên bản đã phát hành");
  }
  for (const model of release.models) {
    const spec = definitions.get(release.graph[model.node].class_type)?.required[model.input];
    if (!Array.isArray(spec) || !Array.isArray(spec[0]) || !spec[0].includes(model.filename)) throw new ComfyPreflightRejectedError("Thiếu model workflow; không tự tải hoặc đổi model");
  }
}
