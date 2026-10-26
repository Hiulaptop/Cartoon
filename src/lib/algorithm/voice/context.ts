import { and, eq } from "drizzle-orm";

import { AlgorithmScriptV1Schema, type AlgorithmScriptV1 } from "@/lib/algorithm/contracts";
import type { Db } from "@/lib/db/client";
import { algorithmRevisionInputs, algorithmRevisions, algorithmVoiceClips, algorithmWorkflows } from "@/lib/db/schema";

import { checkVoiceAgainstScript } from "./checks";
import { clipFingerprint, deliveryOf } from "./clips";
import { AlgorithmVoiceV1Schema, sceneSpeed, type AlgorithmVoiceV1 } from "./contract";
import { buildVoiceTimeline, type VoiceTimeline } from "./timeline";

type Reader = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
type Revision = typeof algorithmRevisions.$inferSelect;
type Clip = typeof algorithmVoiceClips.$inferSelect;
export type VoiceContext = { voice: Revision; voiceContent: AlgorithmVoiceV1; script: Revision; scriptContent: AlgorithmScriptV1; clips: Clip[]; timeline: VoiceTimeline };

// Chuỗi đã duyệt hiện hành: script (accepted) → voice (accepted), mọi clip sẵn sàng, fingerprint khớp nội dung, không còn lỗi cấu trúc/văn nói.
export async function loadApprovedVoiceContext(reader: Reader, videoId: string): Promise<VoiceContext> {
  const [workflow] = await reader.select().from(algorithmWorkflows).where(eq(algorithmWorkflows.videoId, videoId)).limit(1);
  if (!workflow?.acceptedVoiceId || !workflow.acceptedScriptId) throw new Error("Cần duyệt voice trước bước này");
  const [voice] = await reader.select().from(algorithmRevisions)
    .where(and(eq(algorithmRevisions.id, workflow.acceptedVoiceId), eq(algorithmRevisions.videoId, videoId), eq(algorithmRevisions.stage, "voice"), eq(algorithmRevisions.status, "approved"))).limit(1);
  if (!voice) throw new Error("Revision voice được duyệt không tồn tại");
  const [edge] = await reader.select().from(algorithmRevisionInputs).where(eq(algorithmRevisionInputs.revisionId, voice.id)).limit(1);
  if (!edge || edge.inputRevisionId !== workflow.acceptedScriptId) throw new Error("Voice không còn dựa trên kịch bản hiện hành");
  const [script] = await reader.select().from(algorithmRevisions)
    .where(and(eq(algorithmRevisions.id, workflow.acceptedScriptId), eq(algorithmRevisions.status, "approved"))).limit(1);
  const scriptContent = script ? AlgorithmScriptV1Schema.safeParse(script.content) : undefined;
  const voiceContent = AlgorithmVoiceV1Schema.safeParse(voice.content);
  if (!script || !scriptContent?.success || !voiceContent.success) throw new Error("Kịch bản hoặc voice đã duyệt sai schema");
  const issues = checkVoiceAgainstScript(voiceContent.data, scriptContent.data);
  if (issues.length) throw new Error(`Voice không khớp kịch bản: ${issues[0].message}`);
  const clips = await reader.select().from(algorithmVoiceClips).where(eq(algorithmVoiceClips.voiceRevisionId, voice.id));
  for (const cue of voiceContent.data.cues) {
    const clip = clips.find((item) => item.cueId === cue.id);
    const expected = clipFingerprint({ spokenText: cue.spokenText, voice: voiceContent.data.voice, speed: sceneSpeed(voiceContent.data, cue.sceneId), delivery: deliveryOf(scriptContent.data, cue.sceneId) });
    if (!clip || clip.status !== "ready" || !clip.filePath || !clip.durationMs || clip.fingerprint !== expected) throw new Error(`Clip ${cue.id} chưa sẵn sàng hoặc không khớp nội dung voice`);
  }
  const timeline = buildVoiceTimeline(scriptContent.data, voiceContent.data, clips.map((clip) => ({ cueId: clip.cueId, durationMs: clip.durationMs! })));
  return { voice, voiceContent: voiceContent.data, script, scriptContent: scriptContent.data, clips, timeline };
}
