import { mkdir, readFile, rename, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { z } from "zod";
import { PreparedEpisodeSchema, type PreparedEpisode } from "../../src/lib/local-video/binary-search/contracts";
import { formatSrt } from "../../src/lib/local-video/binary-search/captions";
import { buildEpisodeTraces } from "../../src/lib/local-video/binary-search/trace";
import { loadEpisode, sha256 } from "./content";
import { assertPrivateReviewPath, plainPath, readJson } from "./prepare";

const require = createRequire(import.meta.url);
const pack = path.resolve("workflows/video/binary-search-english/v1");
const recordSchema = z.object({ episodeSha256: z.string(), provenance: PreparedEpisodeSchema.shape.provenance });
export async function inspectPreparedEpisode(root: string): Promise<PreparedEpisode> {
  root = await plainPath(root);
  await assertPrivateReviewPath(root);
  const marker = z.strictObject({ version: z.literal(1), kind: z.literal("binary-search-english-v1") }).parse(await readJson(path.join(root, ".binary-search-video.json")));
  if (!marker) throw new Error("Missing episode marker");
  const episodeFile = await plainPath(path.join(root, "input", "episode.json"));
  const bytes = await readFile(episodeFile);
  const episode = PreparedEpisodeSchema.parse(JSON.parse(bytes.toString("utf8")));
  const record = recordSchema.parse(await readJson(path.join(root, "input", "provenance.json")));
  if (sha256(bytes) !== record.episodeSha256 || JSON.stringify(episode.provenance) !== JSON.stringify(record.provenance)) throw new Error("Prepared episode/provenance mismatch");
  const current = await loadEpisode(pack);
  if (JSON.stringify(current.contentHashes) !== JSON.stringify(episode.provenance.contentHashes)) throw new Error("Episode content changed; prepare a new draft");
  if (JSON.stringify(episode.traces) !== JSON.stringify(buildEpisodeTraces())) throw new Error("Prepared traces differ from the current trace authority");
  if (episode.cues.length !== current.episode.cues.length) throw new Error("Prepared cue count mismatch");
  let cursor = 0;
  for (const [i, cue] of episode.cues.entries()) {
    const original = current.episode.cues[i];
    if (cue.id !== original.id || cue.text !== original.text || JSON.stringify(cue.visual) !== JSON.stringify(original.visual) || cue.from !== cursor || cue.audioStartFrame !== cursor + 6 || cue.durationInFrames !== cue.audioFrames + 21) throw new Error("Prepared cue differs from content/timing");
    cursor += cue.durationInFrames;
    if (!episode.provenance.assets.some((a) => a.src === cue.src && a.sha256 === cue.wavSha256)) throw new Error("Unbound prepared audio");
  }
  if (cursor !== episode.durationInFrames) throw new Error("Prepared duration mismatch");
  for (const asset of episode.provenance.assets) {
    if (!/^(audio\/[A-Za-z0-9_-]+\.wav|fonts\/Geist-Regular\.woff2)$/.test(asset.src)) throw new Error("Unsafe prepared asset path");
    if (sha256(await readFile(await plainPath(path.join(root, "input", "public", asset.src)))) !== asset.sha256) throw new Error("Prepared media checksum mismatch");
  }
  return episode;
}
export function timingReport(episode: PreparedEpisode) {
  const seconds = episode.durationInFrames / 30;
  return { durationSeconds: seconds, durationStatus: seconds >= 450 && seconds <= 510 ? "within-target" : "outside-target-review-draft", chapters: episode.chapters.map((ch) => ({ ...ch, from: episode.cues.find((c) => c.chapterId === ch.id)!.from })) };
}
async function toolHashes() {
  const files = ["scripts/binary-search-video.mts", ...["content", "prepare", "render"].map((n) => `scripts/binary-search-video/${n}.ts`), ...["contracts", "captions", "trace"].map((n) => `src/lib/local-video/binary-search/${n}.ts`), ...["index", "video", "array-view", "interval-view", "explanation-view"].map((n) => `src/remotion/binary-search-english/${n}.tsx`)];
  return Object.fromEntries(await Promise.all(files.map(async (name) => [name, sha256(await readFile(name))])));
}
function stillFrames(episode: PreparedEpisode) {
  const frames = new Set<number>([episode.durationInFrames - 1]);
  for (const chapter of episode.chapters) frames.add(episode.cues.find((c) => c.chapterId === chapter.id)!.audioStartFrame);
  for (const cue of episode.cues) if (cue.visual.kind === "small-search" || cue.visual.kind === "not-found" || ["c19", "c22", "c23", "c24", "c25"].includes(cue.id)) for (const beat of cue.visual.beats) frames.add(cue.audioStartFrame + Math.min(cue.audioFrames - 1, Math.ceil(beat.at * (cue.audioFrames - 1))));
  return [...frames].sort((a, b) => a - b);
}

export async function renderEpisode(args: { root: string; browser: string; mode: "stills" | "segment" | "render"; chapter?: string }) {
  const root = await plainPath(args.root);
  const episode = await inspectPreparedEpisode(root);
  const browserExecutable = await plainPath(args.browser);
  if (path.basename(browserExecutable).toLowerCase() !== "chrome-headless-shell.exe") throw new Error("Use the existing approved Chrome Headless Shell executable");
  const space = await statfs(root);
  if (space.bavail * space.bsize < 5 * 1024 ** 3) throw new Error("Less than 5 GiB available; full capacity requirements are not guaranteed");
  const version = JSON.parse(await readFile(require.resolve("remotion/package.json"), "utf8")).version;
  if (version !== "4.0.537") throw new Error("Unexpected Remotion version");
  const hashes = await toolHashes();
  const chapter = args.mode === "segment" ? episode.chapters.find((c) => c.id === args.chapter) : undefined;
  if (args.mode === "segment" && !chapter) throw new Error("Unknown chapter");
  const attempt = path.join(root, `${args.mode}-${randomUUID()}`);
  await mkdir(attempt);
  await writeFile(path.join(attempt, "attempt.json"), JSON.stringify({ state: "rendering", mode: args.mode, chapter: chapter?.id, tools: hashes, ...timingReport(episode) }, null, 2), { flag: "wx" });
  const { bundle } = await import("@remotion/bundler");
  const { selectComposition, renderMedia, renderStill, getVideoMetadata } = await import("@remotion/renderer");
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/binary-search-english/index.tsx"), publicDir: path.join(root, "input", "public") });
  const inputProps = { episode };
  const composition = await selectComposition({ serveUrl, id: "BinarySearchEnglish", inputProps, browserExecutable });
  const outputs: { name: string; sha256: string }[] = [];
  let metadata: unknown = null;
  if (args.mode === "stills") {
    for (const frame of stillFrames(episode)) {
      const name = `frame-${String(frame).padStart(6, "0")}.png`;
      await renderStill({ composition, serveUrl, inputProps, browserExecutable, frame, output: path.join(attempt, name), licenseKey: "free-license" });
      outputs.push({ name, sha256: sha256(await readFile(path.join(attempt, name))) });
    }
  } else {
    const chapterCues = chapter ? episode.cues.filter((c) => c.chapterId === chapter.id) : episode.cues;
    const from = chapterCues[0].from;
    const last = chapterCues[chapterCues.length - 1];
    const end = last.from + last.durationInFrames - 1;
    const draft = path.join(attempt, "draft.mp4");
    await renderMedia({ composition, serveUrl, inputProps, browserExecutable, codec: "h264", outputLocation: draft, concurrency: 1, crf: 20, pixelFormat: "yuv420p", audioCodec: "aac", audioBitrate: "192k", licenseKey: "free-license", ...(chapter ? { frameRange: [from, end] as [number, number] } : {}), onProgress: ({ progress }) => console.log(`Render ${(progress * 100).toFixed(1)}%`) });
    const actual = await getVideoMetadata(draft);
    if (actual.width !== 1920 || actual.height !== 1080 || actual.fps !== 30 || actual.codec !== "h264" || actual.audioCodec !== "aac" || actual.durationInSeconds === null || Math.abs(actual.durationInSeconds - (end - from + 1) / 30) > 1 / 30 + 0.001) throw new Error("Rendered metadata mismatch; preserve draft and inspect");
    const name = chapter ? `${chapter.id}-preview.mp4` : "episode.mp4";
    await rename(draft, path.join(attempt, name));
    metadata = actual;
    outputs.push({ name, sha256: sha256(await readFile(path.join(attempt, name))) });
    if (!chapter) {
      await writeFile(path.join(attempt, "episode.srt"), formatSrt(episode.captions, 30), { flag: "wx" });
      for (const file of ["transcript.md", "sources.md"]) await writeFile(path.join(attempt, file), await readFile(path.join(pack, file)), { flag: "wx" });
      for (const file of ["episode.srt", "transcript.md", "sources.md"]) outputs.push({ name: file, sha256: sha256(await readFile(path.join(attempt, file))) });
    }
  }
  await inspectPreparedEpisode(root);
  if (JSON.stringify(hashes) !== JSON.stringify(await toolHashes())) throw new Error("Source changed during render; output requires review");
  const evidence = { version: 1, render: "complete", mode: args.mode, ...timingReport(episode), metadata, tools: hashes, provenance: episode.provenance, outputs, visualReview: "pending", listening: "pending", editorial: "pending", production: "not-released" };
  await writeFile(path.join(attempt, "render-complete.json"), JSON.stringify(evidence, null, 2), { flag: "wx" });
  return { attempt, outputs, ...timingReport(episode), review: "pending" };
}
