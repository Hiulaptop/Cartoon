import * as z from "zod";

import type { ChatMessage } from "@/lib/ninerouter/client";
import type { Catalog } from "@/lib/scene/catalog";

import { scriptSchema, type ComboDefinition } from "./schema";

export type ScriptPromptInput = {
  brief: string;
  targetSeconds: number;
  assetNames: string[];
  catalog: Catalog;
  combo: ComboDefinition;
  feedback?: string; // lý do bị loại (người) hoặc lỗi lớp 1 của lần trước
  previous?: string; // JSON của bản trước (để sửa thay vì viết lại từ đầu), nếu có
};

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);

export function scriptMessages(input: ScriptPromptInput): ChatMessage[] {
  const assets = input.assetNames
    .map((name) => input.catalog.get(name))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => `- @${a.name} (${a.displayName}, ${a.kind}) states: ${[...a.variants.keys()].join(", ")}. ${clip(a.description, 240)}`)
    .join("\n");

  const system = [
    "You are a comedy writer for a 2D cartoon on YouTube for English-speaking teens aged 14-18.",
    "Write ONE episode script as a single JSON object. Output ONLY the JSON, no commentary.",
    "Rules:",
    "- All dialogue is English. Each dialogue line is at most 84 characters.",
    "- Content must stay within TV-14 and be advertiser-friendly: no intense violence, sexual content, strong coarse language, or suggestive dialogue; no hate, drugs, or dangerous imitable acts.",
    "- Use ONLY the assets listed below. Refer to characters as @chr_name (no state) and locations as @bg_name or @bg_name.state.",
    "- A character may speak in a beat only if listed in that beat's characters.",
    `- Follow this combo. Tone: ${input.combo.tone} Pacing: ${input.combo.pacing}`,
    `- Structure (in order, adapt counts to fit the length): ${input.combo.structure
      .map((s) => `${s.role} ${s.minSeconds}-${s.maxSeconds}s: ${s.guidance}`)
      .join(" | ")}`,
    `- The first beat is the hook, at most ${input.combo.hook.maxSeconds}s. ${input.combo.hook.guidance}`,
    `- Include at least ${input.combo.minGags} jokes. Mark each in a beat's "gag" with one of these kinds: ${input.combo.gagTechniques
      .map((g) => `${g.kind} (${g.guidance})`)
      .join("; ")}. setupBeat is the id of the beat that planted the joke (earlier beat, or the same beat).`,
    `- Total of all beat "seconds" must be within 15% of ${input.targetSeconds}. Leave enough seconds in each beat to read its dialogue (about 20 characters per second plus a short pause per line).`,
    `JSON Schema of the output:\n${JSON.stringify(z.toJSONSchema(scriptSchema))}`,
  ].join("\n");

  const user = [
    `Brief: ${input.brief || "(none, invent a fresh premise that fits the characters)"}`,
    `Target length: ${input.targetSeconds} seconds. Set "targetSeconds" to ${input.targetSeconds} and "version" to 1.`,
    `Available assets:\n${assets}`,
    input.previous ? `Previous version (revise it rather than starting over):\n${input.previous}` : "",
    input.feedback ? `Fix these problems from the previous attempt:\n${input.feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
