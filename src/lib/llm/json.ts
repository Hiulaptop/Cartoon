// Parse the first complete JSON value from an LLM response with optional surrounding prose.
export function extractJson(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.search(/[{[]/);
  if (start < 0) throw new Error("LLM không trả về JSON");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") depth++;
    else if (char === "}" || char === "]") {
      depth--;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
      if (depth < 0) break;
    }
  }
  throw new Error("LLM trả về JSON không hoàn chỉnh");
}
