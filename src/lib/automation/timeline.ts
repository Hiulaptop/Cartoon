import { SUBTITLE } from "@/lib/validation/subtitle";
import { FORMAT, RenderInputSchema, type Clip, type RenderInput, type Storyboard } from "./contracts";
export function buildAudioTimeline(storyboard: Storyboard, clips: Clip[]): RenderInput {
  let frame = 0;
  const cues: RenderInput["cues"] = [];
  for (const scene of storyboard.scenes) for (const cue of scene.cues) {
    const clip = clips.find((item) => item.cueId === cue.id);
    if (!clip) throw new Error(`Thiếu audio cue ${cue.id}`);
    const duration = Math.ceil(clip.durationSeconds * FORMAT.fps) + 6;
    cues.push({ sceneId: scene.id, cueId: cue.id, text: cue.text, from: frame, duration, filePath: clip.filePath });
    frame += duration;
  }
  return RenderInputSchema.parse({ version: 1, storyboard, cues, durationFrames: frame, assetMode: "static" });
}
function srtTime(frame: number) {
  const ms = Math.round(frame / FORMAT.fps * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function wrapCaption(text: string): string {
  const lines = [""];
  for (const word of text.trim().split(/\s+/)) {
    if (word.length > SUBTITLE.maxCharsPerLine) throw new Error("Một từ phụ đề vượt giới hạn ký tự/dòng");
    const last = lines.length - 1;
    const next = lines[last] ? `${lines[last]} ${word}` : word;
    if (next.length > SUBTITLE.maxCharsPerLine) lines.push(word); else lines[last] = next;
  }
  if (lines.length > SUBTITLE.maxLines) throw new Error("Phụ đề cue vượt giới hạn dòng; chia ngắn cue trước khi sinh giọng");
  return lines.join("\n");
}
export function buildSrt(input: RenderInput) {
  return input.cues.map((cue, index) => `${index + 1}\n${srtTime(cue.from)} --> ${srtTime(cue.from + cue.duration - 6)}\n${wrapCaption(cue.text)}\n`).join("\n");
}
