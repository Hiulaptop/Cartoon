import { createHash } from "node:crypto";
import type { VisualSnapshot, VoiceoverTimelineV1 } from "./types";
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export const sha256 = (value: string | Uint8Array): string => createHash("sha256").update(value).digest("hex");
export const objectHash = (value: unknown): string => sha256(canonicalJson(value));
export const visualFingerprint = (value: VisualSnapshot): string => objectHash(value);
export const timelineHash = (value: VoiceoverTimelineV1): string => objectHash(value);
