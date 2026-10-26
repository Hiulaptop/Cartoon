import { AnimationStage } from "@/components/algorithm/animation-stage";
import { buildAudioCues, buildCaptions, buildCueWindows, buildSceneAssets } from "@/lib/algorithm/animation/playback";
import { loadBoundAssetFiles } from "@/lib/algorithm/asset-binding";
import { getDb } from "@/lib/db/client";
import { loadApprovedVoiceContext } from "@/lib/algorithm/voice/context";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export async function AnimationStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns } = data;
  const animation = revisions.find((revision) => revision.id === workflow.activeAnimationId);
  const run = animation?.generationRunId ? generationRuns.find((item) => item.id === animation.generationRunId) : undefined;
  // Dữ liệu phát lại (phụ đề theo cue, cửa sổ cue, audio) dựng từ voice đã duyệt; voice đổi thì không có preview đồng bộ.
  let playback;
  try {
    const voice = await loadApprovedVoiceContext(getDb(), workflow.videoId);
    const bindings = await loadBoundAssetFiles(voice.script.id);
    playback = {
      sceneAssets: buildSceneAssets(voice.scriptContent, bindings, (filePath) => `/api/files/${filePath}`),
      audio: buildAudioCues(voice.timeline, (cueId) => `/api/files/${voice.clips.find((clip) => clip.cueId === cueId)!.filePath}`),
      captions: buildCaptions(voice.timeline, voice.scriptContent),
      cues: buildCueWindows(voice.timeline),
    };
  } catch {
    playback = undefined;
  }
  return (
    <AnimationStage
      videoId={workflow.videoId}
      concurrencyVersion={workflow.concurrencyVersion}
      acceptedVoiceId={workflow.acceptedVoiceId}
      activeRevision={animation ? { id: animation.id, status: animation.status, inputFingerprint: animation.inputFingerprint, content: animation.content } : undefined}
      runError={run?.error ?? undefined}
      playback={playback}
    />
  );
}
