import { z } from "zod";
import type { ComfyConfig } from "./config";
import { GraphSchema, type ComfyGraph, type ComfyOutput, type PromptObservation } from "./contracts";
import { canonicalHash } from "./registry";

export class ComfyRejectedError extends Error {}
async function body(response: Response, limit: number): Promise<Buffer> {
  if (Number(response.headers.get("content-length")) > limit) throw new Error("ComfyUI response quá lớn");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("ComfyUI response rỗng");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > limit) throw new Error("ComfyUI response quá lớn"); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
async function request(config: ComfyConfig, route: string, signal: AbortSignal, data?: unknown): Promise<{ status: number; value: unknown }> {
  const response = await fetch(`${config.baseUrl}${route}`, { method: data === undefined ? "GET" : "POST", headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data), redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(data === undefined ? 10000 : 30000)]), cache: "no-store" });
  const bytes = await body(response, 2 * 1024 * 1024);
  let value: unknown;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw new Error("ComfyUI trả JSON không hợp lệ"); }
  return { status: response.status, value };
}
export async function readComfyJson(config: ComfyConfig, route: string, signal: AbortSignal): Promise<unknown> {
  const result = await request(config, route, signal);
  if (result.status !== 200) throw new Error(`ComfyUI GET thất bại (${result.status})`);
  return result.value;
}
export async function submitPrompt(config: ComfyConfig, graph: ComfyGraph, clientId: string, signal: AbortSignal): Promise<{ promptId: string; queueNumber: number }> {
  const result = await request(config, "/prompt", signal, { prompt: graph, client_id: clientId, extra_data: { cartoon_client_id: clientId } });
  const rejection = z.object({ error: z.object({ type: z.string(), message: z.string(), details: z.string(), extra_info: z.record(z.string(), z.unknown()) }), node_errors: z.record(z.string(), z.unknown()) }).safeParse(result.value);
  if (result.status === 400 && rejection.success && ["prompt_outputs_failed_validation", "prompt_no_outputs"].includes(rejection.data.error.type)) throw new ComfyRejectedError("ComfyUI từ chối graph khi validation; chưa enqueue");
  if (result.status !== 200) throw new Error(`ComfyUI POST chưa xác định (${result.status})`);
  const accepted = z.object({ prompt_id: z.uuid(), number: z.number(), node_errors: z.record(z.string(), z.unknown()) }).parse(result.value);
  return { promptId: accepted.prompt_id, queueNumber: accepted.number };
}
const tupleSchema = z.tuple([z.number(), z.string(), GraphSchema, z.record(z.string(), z.unknown())]).rest(z.unknown());
const outputSchema = z.object({ filename: z.string().min(1), subfolder: z.string(), type: z.literal("output") });
export function verifyIdentity(prompt: unknown, clientId: string, graphHash: string): void {
  const tuple = tupleSchema.parse(prompt);
  if (tuple[3].client_id !== clientId || tuple[3].cartoon_client_id !== clientId || canonicalHash(tuple[2]) !== graphHash) throw new Error("ComfyUI job identity không khớp");
}
export async function observePrompt(config: ComfyConfig, promptId: string, clientId: string, graphHash: string, outputNode: string, signal: AbortSignal): Promise<PromptObservation> {
  z.uuid().parse(promptId);
  const history = z.record(z.string(), z.unknown()).parse(await readComfyJson(config, `/history/${promptId}`, signal));
  if (history[promptId]) {
    const entry = z.object({ prompt: z.unknown(), status: z.object({ status_str: z.string(), completed: z.boolean() }), outputs: z.record(z.string(), z.unknown()) }).parse(history[promptId]);
    verifyIdentity(entry.prompt, clientId, graphHash);
    if (tupleSchema.parse(entry.prompt)[1] !== promptId) throw new Error("History prompt ID không khớp");
    if (entry.status.status_str === "error") return { state: "failed" };
    if (entry.status.status_str === "success" && entry.status.completed) {
      const images = z.object({ images: z.array(outputSchema).length(1) }).parse(entry.outputs[outputNode]);
      return { state: "completed", output: images.images[0] };
    }
  }
  const queue = z.object({ queue_running: z.array(tupleSchema), queue_pending: z.array(tupleSchema) }).parse(await readComfyJson(config, "/queue", signal));
  for (const [state, items] of [["running", queue.queue_running], ["queued", queue.queue_pending]] as const) {
    const match = items.find((item) => item[1] === promptId);
    if (match) { verifyIdentity(match, clientId, graphHash); return { state }; }
  }
  return { state: "missing" };
}
export async function findCorrelatedPrompt(config: ComfyConfig, clientId: string, graphHash: string, signal: AbortSignal): Promise<string | null> {
  const queue = z.object({ queue_running: z.array(tupleSchema), queue_pending: z.array(tupleSchema) }).parse(await readComfyJson(config, "/queue", signal));
  const history = z.record(z.string(), z.object({ prompt: z.unknown() }).passthrough()).parse(await readComfyJson(config, "/history?max_items=200", signal));
  const tuples: unknown[] = [...queue.queue_running, ...queue.queue_pending, ...Object.values(history).map((entry) => entry.prompt)];
  const ids = new Set<string>();
  for (const candidate of tuples) {
    const tuple = tupleSchema.safeParse(candidate);
    if (tuple.success && tuple.data[3].client_id === clientId && tuple.data[3].cartoon_client_id === clientId) { verifyIdentity(candidate, clientId, graphHash); ids.add(z.uuid().parse(tuple.data[1])); }
  }
  if (ids.size > 1) throw new Error("Có nhiều job cùng correlation; cần đối soát thủ công");
  return [...ids][0] ?? null;
}
export async function downloadOutput(config: ComfyConfig, output: ComfyOutput, signal: AbortSignal): Promise<Buffer> {
  const validSegment = (s: string) => !!s && s !== "." && s !== ".." && !/[\\/:\x00-\x1f]/.test(s) && !/[. ]$/.test(s);
  if (!validSegment(output.filename) || (output.subfolder && !output.subfolder.split("/").every(validSegment)) || output.type !== "output") throw new Error("ComfyUI output path không an toàn");
  const query = new URLSearchParams(output);
  const response = await fetch(`${config.baseUrl}/view?${query}`, { redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]), cache: "no-store" });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Không tải được ảnh ComfyUI (${response.status})`); }
  return body(response, 25 * 1024 * 1024);
}
