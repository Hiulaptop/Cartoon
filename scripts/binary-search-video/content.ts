import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { EpisodeDefinitionSchema, VoiceRequestSchema, type VoiceRequest, type EpisodeCue, type Example } from "../../src/lib/local-video/binary-search/contracts";
import { wrapCaption } from "../../src/lib/local-video/binary-search/captions";

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export async function loadEpisode(packDir: string) {
  const contentHashes: Record<string, string> = {};
  const read = async (name: string) => {
    const bytes = await readFile(path.join(packDir, name));
    contentHashes[name] = sha256(bytes);
    return bytes.toString("utf8");
  };
  const episode = EpisodeDefinitionSchema.parse(JSON.parse(await read("episode.json")));
  const chapters = new Set(episode.chapters.map((c) => c.id));
  const ids = new Set<string>();
  let chapterIndex = -1;
  for (const cue of episode.cues) {
    if (ids.has(cue.id) || !chapters.has(cue.chapterId)) throw new Error(`Duplicate cue or unknown chapter: ${cue.id}`);
    ids.add(cue.id);
    const nextChapter = episode.chapters.findIndex((c) => c.id === cue.chapterId);
    if (nextChapter < chapterIndex || nextChapter > chapterIndex + 1) throw new Error("Chapters must be ordered and nonempty");
    chapterIndex = nextChapter;
    if (cue.text !== cue.text.trim().replace(/\s+/g, " ") || cue.text.split(" ").length > 60 || [...cue.text].length > 400) throw new Error(`Invalid narration limits: ${cue.id}`);
    if (cue.captionSegments.join(" ") !== cue.text) throw new Error(`Captions differ from narration: ${cue.id}`);
    cue.captionSegments.forEach(wrapCaption);
    const visualExamples: Partial<Record<EpisodeCue["visual"]["kind"], Example>> = { "small-search": "small-found", "large-search": "million-found", "not-found": "small-missing" };
    const expected = visualExamples[cue.visual.kind];
    if (expected ? cue.visual.example !== expected || !cue.visual.beats.length : cue.visual.example !== undefined || cue.visual.beats.length !== 0) throw new Error(`Invalid visual mapping: ${cue.id}`);
    if (cue.visual.beats.some((beat, i) => i > 0 && beat.at <= cue.visual.beats[i - 1].at)) throw new Error(`Unordered beats: ${cue.id}`);
  }
  if (chapterIndex !== 4) throw new Error("Missing chapter");
  const requests: VoiceRequest[] = [];
  for (let start = 0; start < episode.cues.length; start += 24) {
    const number = String(requests.length + 1).padStart(2, "0");
    const request = VoiceRequestSchema.parse(JSON.parse(await read(`voice-request-${number}.json`)));
    if (request.requestId !== `binary-search-en-v1-${number}`) throw new Error("Unexpected voice request ID");
    for (const [i, cue] of request.cues.entries()) {
      const original = episode.cues[start + i];
      if (!original || cue.id !== original.id || cue.text !== original.text || cue.seed !== 1101001 + start + i || cue.preset !== (original.chapterId === "hook" ? "engaging-hook" : "clear-explainer")) throw new Error(`Voice request mismatch: ${cue.id}`);
    }
    if (request.cues.length !== Math.min(24, episode.cues.length - start)) throw new Error("Voice batch length mismatch");
    requests.push(request);
  }
  const transcript = await read("transcript.md");
  for (const cue of episode.cues) if (!transcript.includes(`**${cue.id}** ${cue.text}`)) throw new Error(`Transcript mismatch: ${cue.id}`);
  await read("sources.md");
  return { episode, requests, contentHashes };
}
