import { createHash } from "node:crypto";

export type ComfyConfig = { enabled: boolean; baseUrl: string; endpointHash: string; timeoutSeconds: number };
export function getComfyConfig(): ComfyConfig {
  const url = new URL(process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("COMFYUI_BASE_URL không hợp lệ");
  const baseUrl = url.toString().replace(/\/+$/, "");
  const timeoutSeconds = Number(process.env.COMFYUI_TIMEOUT_SECONDS || "900");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 3600) throw new Error("COMFYUI_TIMEOUT_SECONDS phải trong 30–3600");
  return { enabled: process.env.COMFYUI_ENABLED === "true", baseUrl, endpointHash: createHash("sha256").update(baseUrl).digest("hex"), timeoutSeconds };
}
