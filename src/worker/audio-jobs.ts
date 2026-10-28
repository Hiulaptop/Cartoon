import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { audioTakes } from "@/lib/db/schema";
import { probeAudio } from "@/lib/audio/probe";
import { storeTakeAudio, verifyAudioSource } from "@/lib/audio/files";
import { takeMeta } from "@/lib/audio/repository";
import { resolveTtsModel, synthesizeSpeech } from "@/lib/ninerouter/tts";
import { PermanentJobError, type JobContext } from "./job-types";
import type { JobPayload } from "@/lib/queue/jobs";

export async function generateAudio(payload: JobPayload, ctx: JobContext) {
  const id = z.uuid().parse(payload.takeId);
  const db = getDb();
  const [take] = await db.select().from(audioTakes).where(eq(audioTakes.id, id));
  if (!take || take.source !== "tts") throw new PermanentJobError("Không có bản thu TTS");
  if (["pending_review", "approved", "rejected"].includes(take.status)) {
    await verifyAudioSource(takeMeta(take)); return { takeId: id, reused: true };
  }
  if (take.synthesisStartedAt) throw new PermanentJobError("TTS đã gửi trước đây nhưng chưa lưu được kết quả; không tự gửi lại");
  let timer: ReturnType<typeof setInterval> | undefined;
  let ownsClaim = false;
  try {
    if (take.status !== "generating" || !take.text || !take.modelMetadata) throw new Error("Bản thu TTS không hợp lệ");
    const model = await resolveTtsModel(take.modelMetadata.modelId);
    if (take.text.length > model.maxCharacters) throw new Error("Văn bản vượt giới hạn model");
    const [claimed] = await db.update(audioTakes).set({ synthesisStartedAt: new Date() }).where(and(eq(audioTakes.id, id), eq(audioTakes.status, "generating"), isNull(audioTakes.synthesisStartedAt))).returning({ id: audioTakes.id });
    if (!claimed) throw new PermanentJobError("Bản thu đã được worker khác nhận; không gửi TTS lần nữa");
    ownsClaim = true;
    await ctx.extendLock(180);
    timer = setInterval(() => { void ctx.extendLock(180).catch(() => undefined); }, 15_000);
    const bytes = await synthesizeSpeech({ modelId: model.modelId, text: take.text });
    const meta = await probeAudio(bytes, "audio/mpeg");
    const saved = await storeTakeAudio(id, bytes, meta);
    await db.update(audioTakes).set({ ...saved, status: "pending_review" }).where(eq(audioTakes.id, id));
    return { takeId: id, bytes: saved.bytes, durationSeconds: saved.durationSeconds, sha256: saved.sha256, model: model.modelId };
  } catch (error) {
    await db.update(audioTakes).set({ status: "failed" }).where(and(eq(audioTakes.id, id), eq(audioTakes.status, "generating"), ...(ownsClaim ? [] : [isNull(audioTakes.synthesisStartedAt)])));
    const message = error instanceof Error && /^(TTS không|9router TTS HTTP|Model\/voice|Văn bản vượt|Bản thu|Không đọc được|Codec không|Audio phải)/.test(error.message) ? error.message : "Không thể hoàn tất TTS; kiểm tra cấu hình hoặc tạo take mới";
    throw new PermanentJobError(message);
  } finally { clearInterval(timer); }
}
