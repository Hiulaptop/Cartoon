import type { ChatMessage } from "@/lib/ninerouter/client";

import type { AssetKind } from "./naming";
import { generationSizeInfo, type AssetGenerationSize } from "./generation-size";

const STYLE = "2D flat cartoon style, thick clean black outlines, simple shading, no text, no watermark";
export type ArtStyle = "cartoon" | "pixel";
const STYLE_PIXEL = "pixel art, 16-bit retro game sprite style, limited color palette, crisp square pixels, clean dark outlines, no anti-aliasing, no text, no watermark";
const GREEN_BG = "on a perfectly flat solid pure green (#00FF00) background, no shadow on the background";

const STATE_PHRASES: Record<string, string> = {
  base: "",
  idle: "standing relaxed, neutral expression",
  talk_a: "talking, mouth wide open",
  talk_b: "talking, mouth half open",
  happy: "big happy smile",
  sad: "sad expression, slumped shoulders",
  angry: "angry expression, frowning",
  surprised: "surprised expression, eyes wide open",
  walk: "walking pose, mid-step",
  day: "bright daytime lighting",
  night: "night time, dark blue lighting",
  rain: "rainy weather",
  broken: "broken, damaged",
};

// Prompt ảnh cho một biến thể. Mô tả asset giữ nguyên giữa các biến thể để nhân vật ít lệch nhất có thể.
export function imagePrompt(kind: AssetKind, description: string, state: string, feedback?: string, style: ArtStyle = "cartoon", generationSize?: AssetGenerationSize | null): string {
  const parts = [description.trim()];
  const phrase = STATE_PHRASES[state];
  if (phrase) parts.push(phrase);
  const framing: Record<AssetKind, string> = {
    chr: "full body, front view, centered",
    bg: generationSize ? `${generationSizeInfo(generationSize).aspectLabel} background scene, no characters` : "wide 16:9 background scene, no characters",
    prop: "single object centered, nothing else in the frame",
    fx: "single effect centered, nothing else in the frame",
  };
  parts.push(framing[kind]);
  parts.push(style === "pixel" ? STYLE_PIXEL : STYLE);
  if (kind !== "bg") parts.push(GREEN_BG);
  if (generationSize) {
    const preset = generationSizeInfo(generationSize);
    parts.push(`requested canvas ${preset.width}x${preset.height} pixels, aspect ratio ${preset.aspectLabel}`);
  }
  if (feedback?.trim()) parts.push(`Fix these problems from the previous attempt: ${feedback.trim()}`);
  return parts.join(", ");
}

export type AssetProposal = { name: string; displayName: string; description: string };

// LLM viết lại mô tả và đề xuất tên. Kết quả phải được kiểm tra bằng parseProposal.
export function proposalMessages(kind: AssetKind, brief: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "You design reusable assets for a 2D cartoon series for English-speaking teens (14-18). " +
        "Return ONLY a JSON object with keys: name, displayName, description. " +
        `name: lowercase ASCII snake_case starting with "${kind}_", max 40 chars, no accents. ` +
        "displayName: short human-friendly name. " +
        "description: one detailed English paragraph (60-120 words) describing only fixed visual traits " +
        "(shape, colors, clothing, proportions), so the same asset can be redrawn consistently. " +
        "No background, pose or emotion in the description.",
    },
    { role: "user", content: `Asset kind: ${kind}\nBrief from the operator: ${brief}` },
  ];
}

export function parseProposal(raw: string): AssetProposal {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("LLM không trả về JSON");
  const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const pick = (key: string) => (typeof json[key] === "string" ? (json[key] as string).trim() : "");
  const proposal = { name: pick("name"), displayName: pick("displayName"), description: pick("description") };
  if (!proposal.name || !proposal.displayName || !proposal.description) throw new Error("JSON thiếu trường bắt buộc");
  return proposal;
}
