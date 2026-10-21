// Ngưỡng phụ đề từ Netflix English Timed Text Style Guide và Subtitle Timing Guidelines
// (tra 2026-10-21). Khán giả 14-18 xếp vào nhóm người lớn (20 ký tự/giây). Đổi ngưỡng = đổi ở đây.
export const SUBTITLE = {
  maxCharsPerSecond: 20, // trẻ em: 17
  maxCharsPerLine: 42,
  maxLines: 2,
  minSeconds: 5 / 6,
  maxSeconds: 7,
} as const;

export const MAX_SUBTITLE_CHARS = SUBTITLE.maxCharsPerLine * SUBTITLE.maxLines; // 84

// Thời gian tối thiểu một câu cần hiện để đọc kịp (không nhỏ hơn mức tối thiểu của một phụ đề).
export function estimateLineSeconds(text: string): number {
  return Math.max(SUBTITLE.minSeconds, text.length / SUBTITLE.maxCharsPerSecond);
}
