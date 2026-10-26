export type UiStatus = "locked" | "todo" | "running" | "review" | "done" | "failed" | "stale";
export type Tone = "muted" | "info" | "warning" | "success" | "destructive";

export const STATUS_META: Record<UiStatus, { label: string; tone: Tone }> = {
  locked: { label: "Chưa mở", tone: "muted" },
  todo: { label: "Cần làm", tone: "muted" },
  running: { label: "Đang xử lý", tone: "info" },
  review: { label: "Chờ duyệt", tone: "warning" },
  done: { label: "Đã duyệt", tone: "success" },
  failed: { label: "Lỗi", tone: "destructive" },
  stale: { label: "Đã cũ", tone: "warning" },
};

export const TONE_CLASS: Record<Tone, string> = {
  muted: "border-border text-muted-foreground",
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
};
