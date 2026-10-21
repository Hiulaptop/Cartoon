export type UploadMetadata = { title: string; description: string; tags: string[]; categoryId: string };

export const CATEGORIES = [
  { id: "1", label: "Film & Animation" },
  { id: "24", label: "Entertainment" },
] as const;

const FORBIDDEN = /[<>]/;

// Giới hạn từ YouTube Data API: videos resource (tra 2026-10-21).
export function validateMetadata(m: UploadMetadata): string[] {
  const issues: string[] = [];
  if (m.title.trim().length === 0) issues.push("Thiếu tiêu đề");
  if (m.title.length > 100) issues.push(`Tiêu đề dài ${m.title.length} ký tự, tối đa 100`);
  if (FORBIDDEN.test(m.title)) issues.push("Tiêu đề không được chứa < hoặc >");
  const bytes = Buffer.byteLength(m.description, "utf8");
  if (bytes > 5000) issues.push(`Mô tả dài ${bytes} byte, tối đa 5000`);
  if (FORBIDDEN.test(m.description)) issues.push("Mô tả không được chứa < hoặc >");
  // Tổng tag ≤ 500 ký tự; dấu phẩy giữa các tag tính; tag có khoảng trắng tính thêm 2 ký tự (dấu nháy).
  const tagChars = m.tags.reduce((sum, t) => sum + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, m.tags.length - 1);
  if (tagChars > 500) issues.push(`Tag chiếm ${tagChars} ký tự, tối đa 500`);
  if (m.tags.some((t) => FORBIDDEN.test(t))) issues.push("Tag không được chứa < hoặc >");
  if (!CATEGORIES.some((c) => c.id === m.categoryId)) issues.push("Danh mục không hợp lệ");
  return issues;
}
