"use server";

import { errorMessage } from "@/lib/errors";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import { sampleSceneDsl } from "@/lib/scene/sample";
import { parseSceneDsl, type ResolvedAssets, type SceneDsl } from "@/lib/scene/schema";

export type PlaygroundState = {
  json: string;
  issues: string[];
  preview?: { dsl: SceneDsl; assets: ResolvedAssets };
};

export async function playground(_prev: PlaygroundState, formData: FormData): Promise<PlaygroundState> {
  const intent = String(formData.get("intent") ?? "preview");
  const json = String(formData.get("json") ?? "");
  try {
    const catalog = await loadApprovedCatalog();
    if (intent === "sample") {
      const sample = sampleSceneDsl(catalog);
      if (!sample) return { json, issues: ["Cần ít nhất 1 bối cảnh (bg_) và 1 nhân vật (chr_) đã duyệt ở bước 1 để tạo cảnh mẫu."] };
      return { json: JSON.stringify(sample, null, 2), issues: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      return { json, issues: [`JSON sai cú pháp: ${errorMessage(error)}`] };
    }
    const result = parseSceneDsl(parsed);
    if (!result.ok) return { json, issues: result.issues };
    const checked = checkSceneDsl(result.dsl, catalog);
    if (checked.issues.length) return { json, issues: checked.issues };
    return { json, issues: [], preview: { dsl: result.dsl, assets: checked.assets } };
  } catch (error) {
    return { json, issues: [`Lỗi: ${errorMessage(error)}`] };
  }
}
