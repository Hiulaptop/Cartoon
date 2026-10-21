// Lấy một giá trị JSON từ phản hồi LLM (có thể bọc trong ```json ... ``` hoặc kèm lời dẫn).
export function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("LLM không trả về JSON");
  return JSON.parse(text.slice(start, end + 1));
}
