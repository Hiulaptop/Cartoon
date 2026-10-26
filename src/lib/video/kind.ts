export type VideoKind = "cartoon" | "algorithm";

export const VIDEO_KIND_LABELS: Record<VideoKind, string> = {
  cartoon: "Hoạt hình",
  algorithm: "Giảng thuật toán",
};

export const ALGORITHM_STAGE_LABELS: Record<string, string> = {
  problem: "Đề bài",
  solution: "Lời giải",
  combo: "Combo",
  script: "Kịch bản",
  assets: "Asset",
  animation: "Animation",
  render: "Video",
  done: "Hoàn tất",
};
