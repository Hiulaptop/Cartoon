import { VoiceStage } from "@/components/algorithm/voice-stage";
import { AlgorithmScriptV1Schema } from "@/lib/algorithm/contracts";
import { checkSubtitleTiming, checkVoiceAgainstScript } from "@/lib/algorithm/voice/checks";
import { AlgorithmVoiceV1Schema } from "@/lib/algorithm/voice/contract";
import { buildVoiceTimeline } from "@/lib/algorithm/voice/timeline";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";
import { fetchTTSVoices } from "@/lib/tts/client";

export async function VoiceStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns, voiceClips } = data;
  const voices = (await fetchTTSVoices()).filter((voice) => voice.is_south).map(({ id, label }) => ({ id, label }));
  const revision = revisions.find((item) => item.id === workflow.activeVoiceId);
  const script = revisions.find((item) => item.id === workflow.acceptedScriptId);
  const scriptContent = script ? AlgorithmScriptV1Schema.safeParse(script.content) : undefined;
  const content = revision ? AlgorithmVoiceV1Schema.safeParse(revision.content) : undefined;
  const clips = revision ? voiceClips.filter((clip) => clip.voiceRevisionId === revision.id) : [];
  const issues = content?.success && scriptContent?.success ? checkVoiceAgainstScript(content.data, scriptContent.data) : [];
  let warnings: ReturnType<typeof checkSubtitleTiming> = [];
  if (content?.success && scriptContent?.success && clips.length > 0 && clips.every((clip) => clip.status === "ready" && clip.durationMs)) {
    try {
      warnings = checkSubtitleTiming(scriptContent.data, buildVoiceTimeline(scriptContent.data, content.data, clips.map((clip) => ({ cueId: clip.cueId, durationMs: clip.durationMs! }))));
    } catch {
      // Thiếu clip cho một cue: chưa dựng được timeline nên bỏ qua cảnh báo phụ đề.
    }
  }
  const run = revision?.generationRunId ? generationRuns.find((item) => item.id === revision.generationRunId) : undefined;
  return (
    <VoiceStage
      videoId={workflow.videoId}
      concurrencyVersion={workflow.concurrencyVersion}
      acceptedScriptId={workflow.acceptedScriptId}
      voices={voices}
      scenes={scriptContent?.success ? scriptContent.data.scenes.map((scene) => ({ id: scene.id, dialogue: scene.dialogue, subtitles: scene.subtitles })) : []}
      activeRevision={revision ? { id: revision.id, status: revision.status, inputFingerprint: revision.inputFingerprint, content: content?.success ? content.data : undefined } : undefined}
      clips={clips.map((clip) => ({ cueId: clip.cueId, status: clip.status, filePath: clip.filePath, durationMs: clip.durationMs, error: clip.error }))}
      issues={issues.map((issue) => issue.message)}
      warnings={warnings.map((issue) => issue.message)}
      runError={run?.error ?? undefined}
    />
  );
}
