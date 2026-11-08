import { and, eq } from "drizzle-orm";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";
import { getDb } from "@/lib/db/client";
import { automationRevisions } from "@/lib/db/schema";
import { StoryboardSchema, type Clip, type Storyboard } from "@/lib/automation/contracts";
import { canonicalHash, sha256 } from "@/lib/automation/fingerprint";
import { readDataFile, writeDataFile } from "@/lib/storage";
import { runPaidOperation } from "@/lib/automation/usage";
import { resolveTtsModel, synthesizeSpeech } from "@/lib/ninerouter/tts";
import type { JobContext, JobHandler } from "../job-types";
import { guardJob, publishArtifact, type RunContext } from "./run-guard";

export async function loadStoryboard(context: RunContext) {
  if (!context.snapshot.storyboardId) throw new Error("Thiếu storyboard");
  const [row] = await getDb().select().from(automationRevisions).where(and(eq(automationRevisions.id, context.snapshot.storyboardId), eq(automationRevisions.videoId, context.video.id)));
  if (!row || row.stale || row.kind !== "storyboard") throw new Error("Storyboard đã cũ");
  if (canonicalHash(row.content) !== row.hash) throw new Error("Storyboard hash không khớp");
  return { row, storyboard: StoryboardSchema.parse(row.content) };
}
export async function measureAudio(bytes: Uint8Array) {
  const media = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  try {
    const duration = await media.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180) throw new Error("Thời lượng audio không hợp lệ");
    return duration;
  } finally { media.dispose(); }
}
export async function generateClips(context: RunContext, ctx: JobContext, storyboard: Storyboard): Promise<Clip[]> {
  const voice = await resolveTtsModel(context.profile.voice);
  const clips: Clip[] = [];
  for (const scene of storyboard.scenes) for (const cue of scene.cues) {
    await ctx.extendLock(300);
    const identity = { text: cue.spokenText, language: context.profile.language, voice: voice.modelId, profileHash: canonicalHash(context.profile), adapterVersion: 1 };
    const fingerprint = canonicalHash(identity);
    const filePath = `automation/private/audio/${fingerprint}.mp3`;
    let bytes: Buffer | null = null;
    // The checksum sidecar is published only after valid audio has been measured.
    try {
      const cached = await readDataFile(filePath);
      const checksum = (await readDataFile(`${filePath}.sha256`)).toString("utf8");
      if (sha256(cached) === checksum) bytes = cached;
    } catch { /* Missing cache is not an upstream failure. */ }
    if (!bytes) {
      bytes = await runPaidOperation({ runId: context.run.id, key: `tts-${cue.id}`, request: identity, call: () => synthesizeSpeech({ modelId: voice.modelId, text: cue.spokenText }) });
      await measureAudio(bytes);
      await writeDataFile(filePath, bytes);
      await writeDataFile(`${filePath}.sha256`, sha256(bytes));
    }
    clips.push({ cueId: cue.id, fingerprint, filePath, sha256: sha256(bytes), durationSeconds: await measureAudio(bytes) });
  }
  return clips;
}
export const generateAutomationAudio: JobHandler = (payload, ctx) => guardJob(payload, ctx, async (context) => {
  const { row, storyboard } = await loadStoryboard(context);
  const clips = await generateClips(context, ctx, storyboard);
  await publishArtifact(context, "audio", { version: 1, clips }, { storyboardId: row.id, storyboardHash: row.hash });
});
