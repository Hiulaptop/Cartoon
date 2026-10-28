import { z } from "zod";
import type { AudioSourceMeta } from "./types";

const frame = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const voiceoverTimelineSchema = z.strictObject({
  version: z.literal(1), fps: z.literal(30), visualFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  clips: z.array(z.strictObject({
    id: z.uuid(), takeId: z.uuid(), from: frame, trimBefore: frame, durationInFrames: frame.positive(),
    volume: z.number().min(0).max(1), fadeInFrames: frame, fadeOutFrames: frame,
    allowOverlap: z.boolean(), label: z.string().max(120), speakerRef: z.string().max(120).optional(),
  })).max(64),
});

export function validateVoiceover(input: unknown, sources: Record<string, AudioSourceMeta>, videoFrames: number) {
  const parsed = voiceoverTimelineSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  const timeline = parsed.data;
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const clip of timeline.clips) {
    if (ids.has(clip.id)) issues.push("ID clip bị trùng");
    ids.add(clip.id);
    const source = sources[clip.takeId];
    if (!source || clip.trimBefore + clip.durationInFrames > Math.floor(source.durationSeconds * 30)) issues.push(`${clip.label}: vượt thời lượng nguồn hoặc bản thu chưa duyệt`);
    if (clip.from + clip.durationInFrames > videoFrames) issues.push(`${clip.label}: vượt thời lượng video`);
    if (clip.fadeInFrames + clip.fadeOutFrames > clip.durationInFrames) issues.push(`${clip.label}: fade dài hơn clip`);
    const active = timeline.clips.filter((c) => c.from <= clip.from && c.from + c.durationInFrames > clip.from);
    if (active.length > 4) issues.push("Tối đa 4 clip đồng thời");
    for (const other of timeline.clips) {
      if (other.id !== clip.id && other.from < clip.from + clip.durationInFrames && clip.from < other.from + other.durationInFrames && (!clip.allowOverlap || !other.allowOverlap)) issues.push("Các clip giao nhau đều phải bật cho phép trộn");
    }
  }
  return issues.length ? { ok: false as const, issues: [...new Set(issues)] } : { ok: true as const, timeline };
}
