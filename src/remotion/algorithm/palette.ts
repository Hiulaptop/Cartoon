// Semantic palette (spec algorithm-video §8.2, art direction 2026-10-24): nền kem sáng, mực đậm cho chữ chính.
// Cam = tiến trình/nhấn, vàng = phần tử đang xét, xanh = dữ liệu hợp lệ, đỏ = loại/cảnh báo.
// Chữ trên vàng và kem luôn dùng màu mực để giữ tương phản cao.
export const PALETTE = {
  paper: "#FFF8E7",
  surface: "#FFFFFF",
  ink: "#1F2937",
  inkMuted: "#4B5563",
  line: "#E7D9B5",
  progress: "#F97316",
  focus: "#FACC15",
  valid: "#16A34A",
  reject: "#DC2626",
} as const;
