import type { VideoKind } from "@/lib/video/kind";

// Chế độ giao diện dùng đúng từ vựng của loại video để khỏi phải ánh xạ qua lại.
export type Mode = VideoKind;

export const MODES: readonly Mode[] = ["cartoon", "algorithm"];
export const DEFAULT_MODE: Mode = "cartoon";
export const MODE_COOKIE = "mode";

export const MODE_LABELS: Record<Mode, string> = {
  cartoon: "Cartoon",
  algorithm: "Giảng bài",
};

export const isMode = (value: unknown): value is Mode => MODES.some((mode) => mode === value);

// Giá trị thiếu hoặc sai luôn về chế độ mặc định (spec S3).
export const parseMode = (raw: string | null | undefined): Mode => (isMode(raw) ? raw : DEFAULT_MODE);
