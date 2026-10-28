export const ASSET_GENERATION_SIZES = [
  { value: "1024x1024", width: 1024, height: 1024, aspectLabel: "1:1", label: "1024×1024 — Vuông 1:1" },
  { value: "1920x1080", width: 1920, height: 1080, aspectLabel: "16:9", label: "1920×1080 — Ngang 16:9" },
  { value: "1080x1920", width: 1080, height: 1920, aspectLabel: "9:16", label: "1080×1920 — Dọc 9:16" },
  { value: "1536x1024", width: 1536, height: 1024, aspectLabel: "3:2", label: "1536×1024 — Ngang 3:2" },
  { value: "1024x1536", width: 1024, height: 1536, aspectLabel: "2:3", label: "1024×1536 — Dọc 2:3" },
] as const;

export type AssetGenerationSize = (typeof ASSET_GENERATION_SIZES)[number]["value"];

export function parseGenerationSize(input: unknown): AssetGenerationSize | null {
  if (input === undefined || input === null || input === "" || input === "model_default") return null;
  const preset = ASSET_GENERATION_SIZES.find((entry) => entry.value === input);
  if (!preset) throw new Error("Chọn kích thước yêu cầu trong danh sách preset");
  return preset.value;
}

export function generationSizeInfo(size: AssetGenerationSize) {
  const preset = ASSET_GENERATION_SIZES.find((entry) => entry.value === size);
  if (!preset) throw new Error("Kích thước yêu cầu không hợp lệ");
  return preset;
}
