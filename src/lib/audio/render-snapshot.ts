import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { loadRenderInput, type AudioDb } from "@/lib/render/input";
import { dataPath } from "@/lib/storage";
import { approvedSources, latestTimeline } from "./repository";
import { objectHash, visualFingerprint, timelineHash, sha256 } from "./fingerprint";
import { validateVoiceover } from "./schema";
import { verifyAudioSource } from "./files";
import type { RenderRequestV1, ResolvedVoiceover } from "./types";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const audioRequestSchema = z.discriminatedUnion("mode", [z.strictObject({ mode: z.literal("silent") }), z.strictObject({ mode: z.literal("voiceover"), timelineVersionId: z.uuid(), timelineHash: hash, takeHashes: z.record(z.uuid(), hash) })]);
export async function prepareRenderRequest(videoId: string, selection: { mode: "silent" } | { mode: "voiceover"; timelineVersionId: string }, db: AudioDb = getDb()): Promise<RenderRequestV1> {
  const input = await loadRenderInput(videoId, db);
  const request: RenderRequestV1 = { version: 1, renderId: randomUUID(), videoId, visual: input.visual, visualHash: visualFingerprint(input.visual), imageFiles: input.imageFiles, audio: { mode: "silent" } };
  if (selection.mode === "voiceover") {
    const latest = await latestTimeline(videoId, db);
    if (!latest || latest.id !== selection.timelineVersionId || latest.status !== "approved") throw new Error("Timeline phải là bản mới nhất đã duyệt");
    const sources = await approvedSources(videoId, db);
    const checked = validateVoiceover(latest.content, sources, input.visual.scenes.reduce((n, s) => n + s.durationFrames, 0));
    if (!checked.ok || latest.visualFingerprint !== request.visualHash || latest.content.visualFingerprint !== request.visualHash || latest.contentHash !== timelineHash(latest.content)) throw new Error("Timeline đã cũ hoặc không hợp lệ; kiểm tra và duyệt lại");
    const takeHashes: Record<string, string> = {};
    for (const clip of checked.timeline.clips) { await verifyAudioSource(sources[clip.takeId]); takeHashes[clip.takeId] = sources[clip.takeId].sha256; }
    if (!checked.timeline.clips.length) throw new Error("Timeline lồng tiếng cần ít nhất một clip; hoặc chọn video không lồng tiếng");
    request.audio = { mode: "voiceover", timelineVersionId: latest.id, timelineHash: latest.contentHash, takeHashes };
  }
  return request;
}
export async function storeRenderRequest(request: RenderRequestV1): Promise<string> {
  const dir = dataPath(`renders/${request.renderId}`);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "request.json"), JSON.stringify(request), { flag: "wx" });
  return objectHash(request);
}
export async function readRenderRequest(renderId: string, expectedHash: string, videoId: string, checkCurrent = true): Promise<RenderRequestV1> {
  z.uuid().parse(renderId); hash.parse(expectedHash);
  const value: unknown = JSON.parse(await readFile(dataPath(`renders/${renderId}/request.json`), "utf8"));
  if (objectHash(value) !== expectedHash) throw new Error("Render request hash không khớp");
  const header = z.object({ version: z.literal(1), renderId: z.uuid(), videoId: z.uuid(), audio: audioRequestSchema }).parse(value);
  if (header.renderId !== renderId || header.videoId !== videoId) throw new Error("Render request sai design");
  const request = value as RenderRequestV1;
  if (!checkCurrent) return request;
  const selection = header.audio.mode === "silent" ? header.audio : { mode: "voiceover" as const, timelineVersionId: header.audio.timelineVersionId };
  const current = await prepareRenderRequest(videoId, selection);
  if (current.visualHash !== request.visualHash || objectHash(current.imageFiles) !== objectHash(request.imageFiles) || objectHash(current.audio) !== objectHash(request.audio)) throw new Error("Cảnh, asset hoặc timeline đã đổi từ lúc xếp hàng; tạo bản render mới");
  return request;
}
export async function snapshotRenderAudio(request: RenderRequestV1, publicDir: string): Promise<ResolvedVoiceover | undefined> {
  if (request.audio.mode === "silent") return undefined;
  const latest = await latestTimeline(request.videoId);
  if (!latest || latest.id !== request.audio.timelineVersionId || latest.status !== "approved" || timelineHash(latest.content) !== request.audio.timelineHash) throw new Error("Timeline thay đổi trước snapshot");
  const allSources = await approvedSources(request.videoId);
  const sources: ResolvedVoiceover["sources"] = {};
  for (const [takeId, expectedHash] of Object.entries(request.audio.takeHashes)) {
    const source = allSources[takeId];
    if (!source || source.sha256 !== expectedHash) throw new Error("Bản thu đã đổi hoặc chưa duyệt");
    await verifyAudioSource(source);
    const target = path.join(publicDir, source.filePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(dataPath(source.filePath), target);
    if (sha256(await readFile(target)) !== expectedHash) throw new Error("Audio snapshot hash không khớp");
    sources[takeId] = source;
  }
  const frames = request.visual.scenes.reduce((n, s) => n + s.durationFrames, 0);
  const checked = validateVoiceover(latest.content, sources, frames);
  if (!checked.ok || latest.content.visualFingerprint !== request.visualHash) throw new Error("Audio snapshot không hợp lệ");
  return { timeline: checked.timeline, sources };
}
