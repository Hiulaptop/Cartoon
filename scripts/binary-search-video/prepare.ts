import { spawn } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { inspectCaptionAllocation } from "../../src/lib/local-video/binary-search/captions";
import { PreparedEpisodeSchema, type PreparedEpisode } from "../../src/lib/local-video/binary-search/contracts";
import { buildEpisodeTraces } from "../../src/lib/local-video/binary-search/trace";
import { loadEpisode, sha256 } from "./content";

export async function plainPath(file: string): Promise<string> {
  const absolute = path.resolve(file);
  for (let cursor = absolute; ; cursor = path.dirname(cursor)) {
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) throw new Error("Linked paths are not supported");
    if (path.dirname(cursor) === cursor) break;
  }
  const resolved = await realpath(absolute);
  if (resolved.toLowerCase() !== absolute.toLowerCase()) throw new Error("Noncanonical path");
  return resolved;
}
export async function assertPrivateReviewPath(output: string): Promise<void> {
  const overlap = (a: string, b: string) => { const r = path.relative(a, b); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };
  for (const dataDir of new Set([path.resolve("data"), path.resolve(process.env.DATA_DIR || "data")])) {
    let canonicalDataDir: string;
    try { canonicalDataDir = await realpath(dataDir); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; canonicalDataDir = dataDir; }
    for (const data of [dataDir, canonicalDataDir]) if (overlap(data, output) || overlap(output, data)) throw new Error("Review output must not overlap DATA_DIR; use a private directory outside app-served storage");
  }
}
export async function readJson(file: string): Promise<unknown> {
  await plainPath(file);
  if (!(await lstat(file)).isFile()) throw new Error("Expected regular JSON artifact");
  return JSON.parse(await readFile(file, "utf8"));
}
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const completeSchema = z.strictObject({ version: z.literal(1), requestHash: digest, publicationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), manifestSha256: digest, timelineSha256: digest });
const rowSchema = z.object({ cueId: z.string(), fingerprint: digest, src: z.string(), wavSha256: digest, sampleCount: z.number().int().positive().max(6336000), sampleRate: z.number().int().min(8000).max(192000), text: z.string(), from: z.number().int().nonnegative(), audioFrames: z.number().int().positive(), audioStartFrame: z.number().int().nonnegative(), audioEndFrame: z.number().int().positive(), durationInFrames: z.number().int().positive() });
const timelineSchema = z.object({ version: z.literal(1), fps: z.literal(30), requestId: z.string(), requestHash: digest, durationInFrames: z.number().int().positive(), cues: z.array(rowSchema).min(1).max(24) });
const sameJson = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const left = Object.entries(a); const right = Object.entries(b);
    return left.length === right.length && left.every(([key, value]) => Object.hasOwn(b, key) && sameJson(value, (b as Record<string, unknown>)[key]));
  }
  return a === b;
};
async function unlocked(root: string) {
  try { await lstat(path.join(root, ".runner.lock")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return; throw error; }
  throw new Error("Voice runner lock exists; stop and inspect");
}
async function verifyVoice(python: string, root: string, requestId: string) {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(python, ["-I", "scripts/english_voice.py", "verify", "--output", root, "--request-id", requestId], { shell: false, stdio: "ignore" });
    proc.on("error", reject);
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Voice verify failed for ${requestId}, exit ${code}; run verify directly for diagnostics`)));
  });
}
async function sourceFile(root: string, relative: string) {
  if (!/^cache\/[a-f0-9]{64}\/attempts\/[A-Za-z0-9_-]{1,64}\/audio\.wav$/.test(relative)) throw new Error("Unexpected private WAV path");
  const file = await plainPath(path.join(root, relative));
  if (!(await lstat(file)).isFile()) throw new Error("Missing regular WAV");
  return file;
}

export async function prepareEpisode(args: { packDir: string; voiceRoot: string; python: string; outputDir: string }): Promise<PreparedEpisode> {
  const { episode, requests, contentHashes } = await loadEpisode(args.packDir);
  const root = await plainPath(args.voiceRoot);
  const python = await plainPath(args.python);
  const output = path.resolve(args.outputDir);
  // Exclusive creation avoids adopting another episode or a partial preparation.
  await plainPath(path.dirname(output));
  const overlap = (a: string, b: string) => { const r = path.relative(a, b); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };
  if (overlap(root, output) || overlap(output, root)) throw new Error("Render and private voice roots overlap");
  await assertPrivateReviewPath(output);
  const captionIssues: { cueId: string; segment: number; text: string; charactersPerSecond: number | null }[] = [];
  const traces = buildEpisodeTraces();
  const prepared: PreparedEpisode = { version: 1, id: episode.id, title: episode.title, fps: 30, width: 1920, height: 1080, durationInFrames: 0, chapters: episode.chapters, cues: [], captions: [], traces, provenance: { contentHashes, assets: [], voice: [], captionTiming: "estimated-character-weighted-not-word-aligned" } };
  const copies: { source: string; src: string; sha256: string }[] = [];
  const completions: { file: string; hash: string }[] = [];
  for (const request of requests) {
    await unlocked(root);
    await verifyVoice(python, root, request.requestId);
    const run = path.join(root, "runs", request.requestId);
    if (!sameJson(await readJson(path.join(run, "request.json")), request)) throw new Error("Private request does not match approved episode");
    const completeFile = path.join(run, "complete.json");
    const completeBytes = await readFile(await plainPath(completeFile));
    const complete = completeSchema.parse(JSON.parse(completeBytes.toString("utf8")));
    const pub = path.join(run, "publications", complete.publicationId);
    const manifestBytes = await readFile(await plainPath(path.join(pub, "manifest.json")));
    const timelineBytes = await readFile(await plainPath(path.join(pub, "timeline.json")));
    if (sha256(manifestBytes) !== complete.manifestSha256 || sha256(timelineBytes) !== complete.timelineSha256) throw new Error("Voice publication changed");
    const manifest = z.object({ requestId: z.string(), requestHash: digest, technical: z.literal("ready") }).parse(JSON.parse(manifestBytes.toString("utf8")));
    const timeline = timelineSchema.parse(JSON.parse(timelineBytes.toString("utf8")));
    if (timeline.requestId !== request.requestId || manifest.requestId !== request.requestId || timeline.requestHash !== complete.requestHash || manifest.requestHash !== complete.requestHash || timeline.cues.length !== request.cues.length) throw new Error("Voice publication identity mismatch");
    let localCursor = 0;
    const offset = prepared.durationInFrames;
    for (const [i, row] of timeline.cues.entries()) {
      const cue = episode.cues[prepared.cues.length];
      const frames = Math.ceil(row.sampleCount * 30 / row.sampleRate);
      if (row.cueId !== request.cues[i].id || row.text !== cue.text || row.from !== localCursor || row.audioFrames !== frames || row.audioStartFrame !== localCursor + 6 || row.audioEndFrame !== localCursor + 6 + frames || row.durationInFrames !== frames + 21) throw new Error("Voice cue timing/order/text mismatch");
      if (cue.visual.example && cue.visual.beats.some((b) => b.stateIndex >= traces[cue.visual.example!].steps.length)) throw new Error("Visual state out of range");
      const src = `audio/${cue.id}.wav`;
      const source = await sourceFile(root, row.src);
      if (sha256(await readFile(source)) !== row.wavSha256) throw new Error("Private WAV changed after verify");
      copies.push({ source, src, sha256: row.wavSha256 });
      prepared.cues.push({ ...cue, from: offset + row.from, durationInFrames: row.durationInFrames, audioStartFrame: offset + row.audioStartFrame, audioFrames: frames, src, wavSha256: row.wavSha256, fingerprint: row.fingerprint });
      const allocation = inspectCaptionAllocation(cue.captionSegments, offset + row.audioStartFrame, frames);
      prepared.captions.push(...allocation.captions);
      captionIssues.push(...allocation.issues.map((issue) => ({ cueId: cue.id, ...issue })));
      localCursor += row.durationInFrames;
    }
    if (localCursor !== timeline.durationInFrames) throw new Error("Voice total duration mismatch");
    prepared.durationInFrames += localCursor;
    const hash = sha256(completeBytes);
    completions.push({ file: completeFile, hash });
    prepared.provenance.voice.push({ requestId: request.requestId, completeSha256: hash, manifestSha256: complete.manifestSha256, timelineSha256: complete.timelineSha256 });
  }
  if (captionIssues.length) {
    const durationSeconds = prepared.durationInFrames / 30;
    throw new Error(`Preparation refused before output creation: ${JSON.stringify({ durationSeconds, durationStatus: durationSeconds >= 450 && durationSeconds <= 510 ? "within-target" : "outside-target-review-draft", chapters: prepared.chapters.map((chapter) => ({ id: chapter.id, from: prepared.cues.find((cue) => cue.chapterId === chapter.id)!.from })), captionIssues }, null, 2)}`);
  }
  const font = await plainPath(path.resolve("node_modules/geist/dist/fonts/geist-sans/Geist-Regular.woff2"));
  copies.push({ source: font, src: "fonts/Geist-Regular.woff2", sha256: sha256(await readFile(font)) });
  prepared.provenance.assets = copies.map(({ src, sha256 }) => ({ src, sha256 }));
  PreparedEpisodeSchema.parse(prepared);
  await unlocked(root);
  for (const item of completions) if (sha256(await readFile(await plainPath(item.file))) !== item.hash) throw new Error("Completion changed before copy");
  await mkdir(output); // EEXIST is intentional: never reuse an old preparation.
  await writeFile(path.join(output, ".binary-search-video.json"), JSON.stringify({ version: 1, kind: episode.id }), { flag: "wx" });
  await mkdir(path.join(output, "input", "public", "audio"), { recursive: true });
  await mkdir(path.join(output, "input", "public", "fonts"));
  for (const item of copies) {
    await unlocked(root);
    await plainPath(item.source);
    const destination = path.join(output, "input", "public", item.src);
    await copyFile(item.source, destination, constants.COPYFILE_EXCL);
    if (sha256(await readFile(destination)) !== item.sha256) throw new Error("Copied artifact checksum mismatch; retain partial output");
  }
  await unlocked(root);
  for (const item of completions) if (sha256(await readFile(await plainPath(item.file))) !== item.hash) throw new Error("Completion changed during copy");
  const bytes = JSON.stringify(prepared, null, 2) + "\n";
  await writeFile(path.join(output, "input", "provenance.json"), JSON.stringify({ episodeSha256: sha256(bytes), provenance: prepared.provenance }, null, 2), { flag: "wx" });
  await writeFile(path.join(output, "input", "episode.json"), bytes, { flag: "wx" });
  return prepared;
}
