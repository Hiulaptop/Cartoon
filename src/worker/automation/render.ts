import { randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, makeCancelSignal, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { and, eq } from "drizzle-orm";
import { ALL_FORMATS, FilePathSource, Input } from "mediabunny";
import { getDb } from "@/lib/db/client";
import { automationSources, automationRevisions } from "@/lib/db/schema";
import { FORMAT, BundleSchema, ResearchSchema, type Storyboard, type OutputFile } from "@/lib/automation/contracts";
import { checkVisuals } from "@/lib/automation/visual";
import { checkStoryboard } from "@/lib/automation/checks";
import { buildAudioTimeline, buildSrt } from "@/lib/automation/timeline";
import { inspectFile } from "@/lib/automation/files";
import { dataPath, writeDataFile } from "@/lib/storage";
import type { JobHandler, JobContext } from "../job-types";
import { generateClips, loadStoryboard } from "./audio";
import { guardJob, publishArtifact, type RunContext } from "./run-guard";

async function render(context: RunContext, ctx: JobContext, preview: boolean) {
  const { row, storyboard } = await loadStoryboard(context);
  const blockers = checkVisuals(storyboard);
  if (blockers.length) throw new Error(blockers[0].message);
  const selection: Storyboard = preview ? { ...storyboard, scenes: storyboard.scenes.filter((scene) => scene.id === storyboard.previewSceneId) } : storyboard;
  const [approvedResearch] = context.snapshot.researchId ? await getDb().select().from(automationRevisions).where(and(eq(automationRevisions.id, context.snapshot.researchId), eq(automationRevisions.videoId, context.video.id))) : [];
  if (!approvedResearch) throw new Error("Thiếu research đầu vào");
  const issues = checkStoryboard(storyboard, ResearchSchema.parse(approvedResearch.content));
  if (issues.length) throw new Error(issues[0].message);
  const durationException = context.snapshot.durationException?.trim() ?? "";
  const editorial = context.snapshot.editorial;
  const thumbnailTitle = editorial?.thumbnailTitle.trim() || storyboard.title;
  const outputId = randomUUID();
  const relative = `automation/public/${outputId}`;
  const temporary = await mkdtemp(path.join(tmpdir(), "cartoon-automation-"));
  const { cancel, cancelSignal } = makeCancelSignal();
  let lockError: Error | null = null;
  let extending = false;
  const heartbeat = setInterval(() => {
    if (extending) return;
    extending = true;
    void ctx.extendLock(300).catch((error: unknown) => { lockError = error instanceof Error ? error : new Error("Mất worker lock"); cancel(); }).finally(() => { extending = false; });
  }, 20_000);
  try {
    const publicDir = path.join(temporary, "public");
    await mkdir(publicDir);
    await copyFile(path.resolve("node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf"), path.join(publicDir, "font.ttf"));
    const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/automation/entry.tsx"), publicDir, webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve("src") } } }) });
    await ensureBrowser();
    // Layout/font checks run without audio or paid calls; FontGate checks all scenes and cues.
    const placeholder = buildAudioTimeline(storyboard, storyboard.scenes.flatMap((scene) => scene.cues.map((cue) => ({ cueId: cue.id, fingerprint: "0".repeat(64), filePath: "unused.mp3", sha256: "0".repeat(64), durationSeconds: 1 }))));
    const preflightProps = { input: placeholder, preflight: true };
    const preflightComposition = await selectComposition({ serveUrl, id: "AutomationExplainer", inputProps: preflightProps });
    await renderStill({ composition: preflightComposition, serveUrl, inputProps: preflightProps, frame: 0, output: path.join(temporary, "preflight.png"), imageFormat: "png" });
    const thumbnailPreflight = await selectComposition({ serveUrl, id: "AutomationThumbnail", inputProps: { title: thumbnailTitle } });
    await renderStill({ composition: thumbnailPreflight, serveUrl, inputProps: { title: thumbnailTitle }, frame: 0, output: path.join(temporary, "thumbnail-preflight.png"), imageFormat: "png" });
    if (lockError) throw lockError;
    const clips = await generateClips(context, ctx, selection);
    const playback = buildAudioTimeline(selection, clips);
    const seconds = playback.durationFrames / FORMAT.fps;
    if (preview && (seconds < 15 || seconds > 30)) throw new Error(`Preview ${seconds.toFixed(1)} giây; sửa cảnh preview thành 15–30 giây. Không cắt lời hoặc tăng tốc.`);
    if (!preview && (seconds < 240 || seconds > 360) && !durationException) throw new Error(`Video ${seconds.toFixed(1)} giây ngoài 4–6 phút; sửa storyboard hoặc ghi lý do ngoại lệ ở lượt mới. Không cắt lời hoặc tăng tốc.`);
    for (const [index, cue] of playback.cues.entries()) {
      await copyFile(dataPath(cue.filePath), path.join(publicDir, `cue-${index}.mp3`));
      cue.filePath = `cue-${index}.mp3`;
    }
    const audioServeUrl = await bundle({ entryPoint: path.resolve("src/remotion/automation/entry.tsx"), publicDir, webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve("src") } } }) });
    const inputProps = { input: playback };
    await ensureBrowser();
    const composition = await selectComposition({ serveUrl: audioServeUrl, id: "AutomationExplainer", inputProps });
    if (lockError) throw lockError;
    const videoFile = path.join(temporary, "video.mp4");
    await renderMedia({ composition, serveUrl: audioServeUrl, inputProps, codec: "h264", outputLocation: videoFile, licenseKey: "free-license", cancelSignal });
    if (lockError) throw lockError;
    const rendered = new Input({ source: new FilePathSource(videoFile), formats: ALL_FORMATS });
    try {
      const track = await rendered.getPrimaryVideoTrack();
      if (!track || track.codec !== "avc" || track.displayWidth !== FORMAT.width || track.displayHeight !== FORMAT.height || Math.abs(await rendered.computeDuration() - seconds) > 0.2) throw new Error("Video output sai codec, kích thước hoặc thời lượng");
    } finally { rendered.dispose(); }
    const target = dataPath(relative);
    await mkdir(target, { recursive: true });
    await copyFile(videoFile, path.join(target, "video.mp4.tmp"));
    await rename(path.join(target, "video.mp4.tmp"), path.join(target, "video.mp4"));
    const files: OutputFile[] = [await inspectFile(`video-${outputId}`, "video.mp4", `${relative}/video.mp4`, "video/mp4")];
    if (preview) {
      await publishArtifact(context, "preview", { version: 1, files, durationFrames: playback.durationFrames }, { storyboardId: row.id, storyboardHash: row.hash });
      return;
    }
    const thumbnail = await selectComposition({ serveUrl, id: "AutomationThumbnail", inputProps: { title: thumbnailTitle } });
    await renderStill({ composition: thumbnail, serveUrl, inputProps: { title: thumbnailTitle }, output: path.join(target, "thumbnail.png"), imageFormat: "png" });
    files.push(await inspectFile(`thumbnail-${outputId}`, "thumbnail.png", `${relative}/thumbnail.png`, "image/png"));
    const sources = await getDb().select().from(automationSources).where(eq(automationSources.videoId, context.video.id));
    const [researchRow] = context.snapshot.researchId ? await getDb().select().from(automationRevisions).where(and(eq(automationRevisions.id, context.snapshot.researchId), eq(automationRevisions.videoId, context.video.id))) : [];
    if (!researchRow) throw new Error("Thiếu nghiên cứu đầu vào");
    const research = ResearchSchema.parse(researchRow.content);
    const referenced = new Set(research.claims.flatMap((claim) => claim.evidence.map((evidence) => evidence.sourceId)));
    const metadata = { title: storyboard.title.slice(0, 100), description: `${research.answer}\n\nGiới hạn: ${research.limitations.join("; ")}\n\nNguồn:\n${sources.filter((source) => referenced.has(source.id)).map((source) => source.url).join("\n")}`.slice(0, 5000), chapters: storyboard.scenes.map((scene) => ({ seconds: Math.floor((playback.cues.find((cue) => cue.sceneId === scene.id)?.from ?? 0) / FORMAT.fps), title: scene.title })), disclosureReminder: "Người vận hành phải kiểm tra khai báo nội dung tổng hợp, quyền sử dụng và tính chính xác trước khi tự đăng YouTube." };
    if (editorial?.title.trim()) metadata.title = editorial.title.trim();
    if (editorial?.description.trim()) metadata.description = editorial.description.trim();
    const payloads = [
      { id: "subtitles", name: "subtitles.srt", body: buildSrt(playback), mime: "application/x-subrip" },
      { id: "metadata", name: "metadata.json", body: JSON.stringify(metadata, null, 2), mime: "application/json" },
      { id: "sources", name: "sources.md", body: sources.filter((source) => referenced.has(source.id)).map((source) => `- ${source.title.replace(/[\r\n]/g, " ")}\n  ${source.url}\n  Read: ${source.readAt.toISOString()} · SHA-256: ${source.hash}`).join("\n"), mime: "text/markdown" },
      { id: "editorial", name: "editorial.json", body: JSON.stringify({ version: 1, brief: context.brief, answer: research.answer, limitations: research.limitations, claims: research.claims.map((claim) => ({ id: claim.id, text: claim.text, kind: claim.kind, central: claim.central, sourceIds: claim.evidence.map((item) => item.sourceId), dependsOnClaimIds: claim.dependsOnClaimIds })), storyboard }, null, 2), mime: "application/json" },
    ];
    for (const payload of payloads) {
      await writeDataFile(`${relative}/${payload.name}`, payload.body);
      files.push(await inspectFile(`${payload.id}-${outputId}`, payload.name, `${relative}/${payload.name}`, payload.mime));
    }
    // Public manifest excludes internal paths and its own checksum to avoid a hash cycle.
    await writeDataFile(`${relative}/manifest.json`, JSON.stringify({ version: 1, videoId: context.video.id, researchId: researchRow.id, researchHash: researchRow.hash, storyboardId: row.id, storyboardHash: row.hash, requiredReviewGates: [1, 2, 3], durationException, durationFrames: playback.durationFrames, format: FORMAT, files: files.map(({ name, sha256, bytes, mime }) => ({ name, sha256, bytes, mime })) }, null, 2));
    files.push(await inspectFile(`manifest-${outputId}`, "manifest.json", `${relative}/manifest.json`, "application/json"));
    if (lockError) throw lockError;
    const final = BundleSchema.parse({ version: 1, storyboardId: row.id, storyboardHash: row.hash, durationFrames: playback.durationFrames, metadata, files, durationException });
    await publishArtifact(context, "render", final, { storyboardId: row.id, storyboardHash: row.hash });
  } finally {
    clearInterval(heartbeat);
    await rm(temporary, { recursive: true, force: true });
  }
}
export const renderAutomationPreview: JobHandler = (payload, ctx) => guardJob(payload, ctx, (context) => render(context, ctx, true));
export const renderAutomationVideo: JobHandler = (payload, ctx) => guardJob(payload, ctx, (context) => render(context, ctx, false));
