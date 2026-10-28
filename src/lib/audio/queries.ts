import { desc, eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { audioTakes, videos, jobRuns } from "@/lib/db/schema";
import { loadRenderInput } from "@/lib/render/input";
import { visualFingerprint } from "./fingerprint";
import { latestTimeline, takeMeta } from "./repository";
import type { AudioSourceMeta } from "./types";
import { listTtsModels } from "@/lib/ninerouter/tts";

export async function getVoiceoverEditor(videoId: string) {
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return null;
  const takes = await db.select().from(audioTakes).where(eq(audioTakes.videoId, videoId)).orderBy(desc(audioTakes.createdAt));
  const jobs = await db.select({ targetId: jobRuns.targetId, error: jobRuns.error }).from(jobRuns).where(and(eq(jobRuns.jobType, "audio.generate"), eq(jobRuns.status, "failed"))).orderBy(desc(jobRuns.createdAt));
  const errors = Object.fromEntries(jobs.filter((j) => takes.some((t) => t.id === j.targetId)).reverse().map((j) => [j.targetId!, j.error]));
  const sources: Record<string, AudioSourceMeta> = {};
  for (const take of takes) if (take.status === "approved") sources[take.id] = takeMeta(take);
  let visual = null; let visualError = "";
  try { visual = await loadRenderInput(videoId); } catch { visualError = "Cần kịch bản và toàn bộ cảnh đã duyệt để preview, lưu và duyệt timeline."; }
  let models: Awaited<ReturnType<typeof listTtsModels>> = []; let ttsError = "";
  try { models = await listTtsModels(); if (!models.length) ttsError = "9router chưa công bố model TTS. Cấu hình TTS trên router chung rồi refresh."; }
  catch { ttsError = "Không đọc được model TTS; kiểm tra cấu hình và kết nối 9router."; }
  return { video, takes, errors, sources, latest: await latestTimeline(videoId), visual, fingerprint: visual ? visualFingerprint(visual.visual) : null, visualError, models, ttsError };
}
export type VoiceoverEditorData = NonNullable<Awaited<ReturnType<typeof getVoiceoverEditor>>>;
