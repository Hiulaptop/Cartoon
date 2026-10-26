import { and, eq } from "drizzle-orm";

import { AlgorithmScriptV1Schema, type AlgorithmScriptV1 } from "@/lib/algorithm/contracts";
import { fingerprint } from "@/lib/algorithm/revision";
import { checkSpokenText } from "@/lib/algorithm/voice/checks";
import { clipFilePath, clipFingerprint, deliveryOf, HOOK_TEMPERATURE } from "@/lib/algorithm/voice/clips";
import { VOICE_MAX_SPOKEN_CHARS } from "@/lib/algorithm/voice/constants";
import { AlgorithmVoiceV1Schema, cueId, sceneSpeed, type AlgorithmVoiceV1 } from "@/lib/algorithm/voice/contract";
import { VoiceLinesSchema, voiceMessages } from "@/lib/algorithm/voice/prompts";
import { wavDurationMs } from "@/lib/algorithm/voice/wav";
import { getDb } from "@/lib/db/client";
import { algorithmGenerationRuns, algorithmRevisionInputs, algorithmRevisions, algorithmVoiceClips, algorithmWorkflows } from "@/lib/db/schema";
import { extractJson } from "@/lib/llm/json";
import { chat } from "@/lib/ninerouter/client";
import { resolveWriterModel } from "@/lib/algorithm/model";
import type { JobPayload } from "@/lib/queue/jobs";
import { dataFileInfo, writeDataFile } from "@/lib/storage";
import { synthesizeTTS } from "@/lib/tts/client";

import { PermanentJobError, type JobContext } from "./job-types";

type Options = { voice: string; defaultSpeed: number; scenes: { sceneId: string; speed: number }[] };
type Db = ReturnType<typeof getDb>;

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 1000);

async function failVoice(db: Db, revisionId: string, runId: string, error: unknown): Promise<never> {
  const message = errorText(error);
  await db.update(algorithmGenerationRuns).set({ status: "failed", error: message }).where(eq(algorithmGenerationRuns.id, runId));
  await db.update(algorithmRevisions).set({ status: "failed" }).where(eq(algorithmRevisions.id, revisionId));
  throw new PermanentJobError(message);
}

// Lần đầu + tối đa 2 lượt sửa máy (spec algorithm §5.3: giới hạn vòng sửa).
async function writeSpokenText(script: AlgorithmScriptV1, options: Options, snapshot: unknown, ctx: JobContext) {
  const model = resolveWriterModel(snapshot);
  const expected = script.scenes.flatMap((scene) => scene.dialogue.map((_, index) => cueId(scene.id, index)));
  const spoken = new Map<string, string>();
  let feedback: string[] = [];
  let used = { model, usage: undefined as unknown };
  for (let round = 0; round < 3; round += 1) {
    await ctx.extendLock(240);
    const response = await chat({ model, temperature: 0.2, timeoutMs: 180_000, messages: voiceMessages(script, feedback, round === 0 ? undefined : Object.fromEntries(spoken)) });
    used = { model: response.model, usage: response.usage };
    const raw = extractJson(response.content);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) delete (raw as Record<string, unknown>)["$schema"];
    const parsed = VoiceLinesSchema.safeParse(raw);
    if (!parsed.success) { feedback = [`JSON sai schema: ${parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`]; continue; }
    for (const line of parsed.data.lines) if (expected.includes(line.id)) spoken.set(line.id, line.spokenText);
    feedback = [];
    for (const id of expected) {
      const text = spoken.get(id);
      const problem = text === undefined ? "thiếu dòng này" : checkSpokenText(text);
      if (problem) feedback.push(`${id}: ${problem}`);
    }
    if (feedback.length === 0) break;
  }
  const cues = script.scenes.flatMap((scene) => scene.dialogue.map((line, dialogueIndex) => {
    const id = cueId(scene.id, dialogueIndex);
    // Còn lỗi sau các lượt sửa: giữ lời thoại gốc (đã cắt độ dài) để người nghe sửa tay; kiểm máy vẫn chặn duyệt.
    return { id, sceneId: scene.id, dialogueIndex, spokenText: (spoken.get(id) ?? line).slice(0, VOICE_MAX_SPOKEN_CHARS) };
  }));
  const content: AlgorithmVoiceV1 = { version: 1, voice: options.voice, defaultSpeed: options.defaultSpeed, scenes: options.scenes, cues };
  return { content: AlgorithmVoiceV1Schema.parse(content), ...used };
}

export async function generateAlgorithmVoice(payload: JobPayload, ctx: JobContext) {
  const revisionId = typeof payload.revisionId === "string" ? payload.revisionId : "";
  if (!revisionId) throw new PermanentJobError("Payload thiếu revisionId");
  const db = getDb();
  const [revision] = await db.select().from(algorithmRevisions).where(eq(algorithmRevisions.id, revisionId)).limit(1);
  if (!revision || revision.stage !== "voice" || revision.status !== "generating" || !revision.generationRunId) throw new PermanentJobError("Revision voice không hợp lệ");
  const [run] = await db.select().from(algorithmGenerationRuns).where(eq(algorithmGenerationRuns.id, revision.generationRunId)).limit(1);
  if (!run) throw new PermanentJobError("Không có generation run cho revision voice");
  const [edge] = await db.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, revision.id)).limit(1);
  const [script] = edge ? await db.select().from(algorithmRevisions).where(and(eq(algorithmRevisions.id, edge.inputRevisionId), eq(algorithmRevisions.status, "approved"))).limit(1) : [];
  const parsedScript = script ? AlgorithmScriptV1Schema.safeParse(script.content) : undefined;
  if (!script || !parsedScript?.success) return failVoice(db, revision.id, run.id, "Kịch bản đầu vào chưa được duyệt hoặc sai schema");

  const isCurrent = async () => {
    const [workflow] = await db.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, revision.videoId)).limit(1);
    return workflow?.activeVoiceId === revision.id && workflow.acceptedScriptId === script.id;
  };
  const markStale = async () => {
    await db.update(algorithmRevisions).set({ status: "stale" }).where(eq(algorithmRevisions.id, revision.id));
    await db.update(algorithmGenerationRuns).set({ status: "stale" }).where(eq(algorithmGenerationRuns.id, run.id));
    return { stale: true };
  };
  if (!(await isCurrent())) return markStale();
  await db.update(algorithmGenerationRuns).set({ status: "running", promptVersion: "algorithm-voice-v1" }).where(eq(algorithmGenerationRuns.id, run.id));

  let content: AlgorithmVoiceV1;
  let model: string | undefined;
  let usage: unknown;
  const existing = AlgorithmVoiceV1Schema.safeParse(revision.content);
  if (existing.success) {
    content = existing.data; // sửa tay: không gọi LLM
  } else {
    const options = (run.inputSnapshot as { options?: Options }).options;
    if (!options) return failVoice(db, revision.id, run.id, "Thiếu tùy chọn giọng trong generation run");
    try {
      const written = await writeSpokenText(parsedScript.data, options, run.inputSnapshot, ctx);
      content = written.content; model = written.model; usage = written.usage;
    } catch (error) {
      if (ctx.attempt >= 3) await failVoice(db, revision.id, run.id, error).catch(() => undefined);
      throw error; // hạ tầng LLM: runner thử lại
    }
  }

  // Sinh clip tuần tự (service TTS xử lý từng yêu cầu). Clip cùng fingerprint trong cùng video được dùng lại.
  for (const cue of content.cues) {
    await ctx.extendLock(120);
    const speed = sceneSpeed(content, cue.sceneId);
    const delivery = deliveryOf(parsedScript.data, cue.sceneId);
    const fp = clipFingerprint({ spokenText: cue.spokenText, voice: content.voice, speed, delivery });
    const key = { videoId: revision.videoId, voiceRevisionId: revision.id, cueId: cue.id };
    const [reusable] = await db.select().from(algorithmVoiceClips)
      .where(and(eq(algorithmVoiceClips.videoId, revision.videoId), eq(algorithmVoiceClips.fingerprint, fp), eq(algorithmVoiceClips.status, "ready"))).limit(1);
    if (reusable?.filePath && reusable.durationMs && (await dataFileInfo(reusable.filePath))) {
      await db.insert(algorithmVoiceClips).values({ ...key, fingerprint: fp, status: "ready", filePath: reusable.filePath, durationMs: reusable.durationMs })
        .onConflictDoUpdate({ target: [algorithmVoiceClips.voiceRevisionId, algorithmVoiceClips.cueId], set: { fingerprint: fp, status: "ready", filePath: reusable.filePath, durationMs: reusable.durationMs, error: null } });
      continue;
    }
    await db.insert(algorithmVoiceClips).values({ ...key, fingerprint: fp, status: "generating" })
      .onConflictDoUpdate({ target: [algorithmVoiceClips.voiceRevisionId, algorithmVoiceClips.cueId], set: { fingerprint: fp, status: "generating", filePath: null, durationMs: null, error: null } });
    const result = await synthesizeTTS({ text: cue.spokenText, voice: content.voice, speed, ...(delivery === "hook" ? { temperature: HOOK_TEMPERATURE } : {}) });
    if (!result.ok && result.status !== undefined && result.status >= 400 && result.status < 500) {
      // 4xx là lỗi của yêu cầu (giọng không tồn tại, văn bản không hợp lệ): thử lại không giúp gì, thất bại ngay.
      await db.update(algorithmVoiceClips).set({ status: "failed", error: (result.error ?? "TTS từ chối yêu cầu").slice(0, 1000) })
        .where(and(eq(algorithmVoiceClips.voiceRevisionId, revision.id), eq(algorithmVoiceClips.cueId, cue.id)));
      return failVoice(db, revision.id, run.id, result.error ?? "TTS từ chối yêu cầu");
    }
    if (!result.ok || !result.audioBuffer) {
      // Lỗi service TTS là lỗi hạ tầng: chưa hết lượt thử thì ném để runner thử lại (các clip đã xong được tái dùng).
      if (ctx.attempt < 3) throw new Error(result.error ?? "Service TTS không trả audio");
      await db.update(algorithmVoiceClips).set({ status: "failed", error: (result.error ?? "Service TTS không trả audio").slice(0, 1000) })
        .where(and(eq(algorithmVoiceClips.voiceRevisionId, revision.id), eq(algorithmVoiceClips.cueId, cue.id)));
      continue;
    }
    const durationMs = wavDurationMs(result.audioBuffer);
    const filePath = clipFilePath(fp);
    await writeDataFile(filePath, result.audioBuffer);
    await db.update(algorithmVoiceClips).set({ status: "ready", filePath, durationMs, error: null })
      .where(and(eq(algorithmVoiceClips.voiceRevisionId, revision.id), eq(algorithmVoiceClips.cueId, cue.id)));
  }

  if (!(await isCurrent())) return markStale();
  await db.transaction(async (tx) => {
    await tx.update(algorithmRevisions).set({ content, status: "pending_review", model: model ?? revision.model, inputFingerprint: fingerprint({ input: script.inputFingerprint, content }) })
      .where(and(eq(algorithmRevisions.id, revision.id), eq(algorithmRevisions.status, "generating")));
    await tx.update(algorithmGenerationRuns).set({ status: "waiting_review", model, metrics: { usage } }).where(eq(algorithmGenerationRuns.id, run.id));
  });
  return { pendingReview: true, cues: content.cues.length, model, usage };
}
