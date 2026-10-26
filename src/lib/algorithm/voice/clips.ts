import { createHash } from "node:crypto";

import type { AlgorithmScriptV1 } from "@/lib/algorithm/contracts";

import { TTS_ENGINE_VERSION } from "./constants";

// Cách đọc: "hook" cho cảnh mở đầu (đọc biểu cảm hơn, cao độ biến thiên hơn), "normal" cho còn lại.
export type Delivery = "hook" | "normal";

// Cảnh đầu tiên của kịch bản là hook (combo bắt buộc có hook và hook mở video).
export const deliveryOf = (script: AlgorithmScriptV1, sceneId: string): Delivery => (script.scenes[0]?.id === sceneId ? "hook" : "normal");

// Engine bỏ qua `style`; đo 2026-10-25 trên Adam: temperature 1,0 làm F0 std tăng khoảng 4,8 -> 5,8 semitone so với 0,8, 1,15 không hơn.
export const HOOK_TEMPERATURE = 1.0;

// `delivery` chỉ vào fingerprint khi là "hook", nên fingerprint của clip thường không đổi (clip cũ vẫn tái dùng được).
export function clipFingerprint(input: { spokenText: string; voice: string; speed: number; delivery?: Delivery }): string {
  return createHash("sha256").update(JSON.stringify({ spokenText: input.spokenText, voice: input.voice, speed: input.speed, engine: TTS_ENGINE_VERSION, ...(input.delivery === "hook" ? { delivery: "hook", temperature: HOOK_TEMPERATURE } : {}) })).digest("hex");
}

// Đường dẫn tương đối trong DATA_DIR; tên theo fingerprint nên các revision dùng chung một file.
export const clipFilePath = (fingerprint: string) => `voice/${fingerprint}.wav`;
