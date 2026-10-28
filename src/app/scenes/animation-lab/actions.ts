"use server";

import { resolveShowcase } from "@/lib/animation/resolve";
import type { ShowcaseProps } from "@/lib/animation/types";

export async function previewAnimation(json: string): Promise<{ props?: ShowcaseProps; error?: string }> {
  if (json.length > 128_000) return { error: "Draft quá lớn (tối đa 128 KB)" };
  try { return { props: await resolveShowcase(JSON.parse(json)) }; }
  catch (error) { return { error: error instanceof Error ? error.message : "Không thể đọc draft/asset" }; }
}
