import type { Caption } from "./contracts";

export function wrapCaption(text: string): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    if (!word || word.length > 42) throw new Error("Caption contains an empty or overlong word");
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + word.length + 1 <= 42) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  if (lines.length > 2) throw new Error(`Caption exceeds two lines: ${text}`);
  return lines;
}

export function inspectCaptionAllocation(segments: string[], from: number, audioFrames: number): { captions: Caption[]; issues: { segment: number; text: string; charactersPerSecond: number | null }[] } {
  if (!Number.isInteger(from) || from < 0 || !Number.isInteger(audioFrames) || audioFrames < 1 || !segments.length) throw new Error("Invalid caption window");
  const weights = segments.map((s) => s.replace(/\s/g, "").length);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!total) throw new Error("Empty captions");
  let consumed = 0;
  let cursor = from;
  const issues: { segment: number; text: string; charactersPerSecond: number | null }[] = [];
  const captions = segments.map((text, index) => {
    consumed += weights[index];
    const to = index === segments.length - 1 ? from + audioFrames : from + Math.round(consumed / total * audioFrames);
    const density = to > cursor ? text.length * 30 / (to - cursor) : null;
    if (density === null || density > 20) issues.push({ segment: index + 1, text, charactersPerSecond: density });
    const caption: Caption = { from: cursor, to, text, lines: wrapCaption(text), timing: "estimated" };
    cursor = to;
    return caption;
  });
  return { captions, issues };
}

export function allocateCaptions(segments: string[], from: number, audioFrames: number): Caption[] {
  const result = inspectCaptionAllocation(segments, from, audioFrames);
  if (result.issues.length) throw new Error(`Caption density issues: ${JSON.stringify(result.issues)}`);
  return result.captions;
}

export function formatSrt(captions: Caption[], fps: 30): string {
  const clock = (frame: number) => {
    const ms = Math.round(frame * 1000 / fps);
    return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return captions.map((c, i) => `${i + 1}\n${clock(c.from)} --> ${clock(c.to)}\n${c.lines.join("\n")}\n`).join("\n");
}
