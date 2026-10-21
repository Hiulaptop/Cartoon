import * as z from "zod";

import { STATES_BY_KIND } from "@/lib/assets/naming";
import type { ChatMessage } from "@/lib/ninerouter/client";
import type { Catalog } from "@/lib/scene/catalog";
import type { ComboDefinition } from "@/lib/script/schema";

import { castingSchema } from "./schema";

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n)}…` : text);

// Pha 1 (casting): AI chọn asset có sẵn và đề xuất asset/biến thể còn thiếu cho một tập phim.
export function castingMessages(input: { brief: string; targetSeconds: number; catalog: Catalog; combo: ComboDefinition }): ChatMessage[] {
  const assets = [...input.catalog.values()]
    .map((a) => `- ${a.name} (${a.displayName}, ${a.kind}) states with approved images: ${[...a.variants.keys()].join(", ")}. ${clip(a.description, 200)}`)
    .join("\n");
  const allowed = Object.entries(STATES_BY_KIND)
    .map(([kind, states]) => `${kind}: ${states.filter((s) => s !== "base").join(", ")}`)
    .join("; ");
  // Model hay chép nguyên khóa "$schema" vào đầu ra (đã gặp ở M5), nên bỏ khóa đó khỏi schema dán vào prompt.
  const jsonSchema = { ...(z.toJSONSchema(castingSchema) as Record<string, unknown>) };
  delete jsonSchema.$schema;

  const system = [
    "You are the casting director of a 2D cartoon for English-speaking teens (14-18) on YouTube.",
    "Before the episode script is written, decide which existing assets the episode should use and which assets or expression variants are still missing.",
    "Propose a new asset only when the story clearly needs it and no existing asset fits; reuse existing assets first, because every new image costs time and must be reviewed by a human.",
    "Characters that speak need the talk_a and talk_b states for mouth animation; propose them if missing.",
    `Allowed states per kind (base is the original image and is created automatically): ${allowed}.`,
    "Content stays within TV-14 and is advertiser-friendly.",
    "Reply with only a JSON object that matches this JSON Schema:",
    JSON.stringify(jsonSchema),
  ].join("\n");

  const user = [
    `Existing approved assets of this series:\n${assets || "(none yet)"}`,
    `Combo tone: ${input.combo.tone}`,
    `Episode length: ${input.targetSeconds} seconds.`,
    `Episode brief: ${input.brief || "(none, invent a premise that fits the existing characters)"}`,
    'Return the JSON with "version": 1.',
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
