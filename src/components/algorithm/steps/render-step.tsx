import { RenderPanel } from "@/components/algorithm/render-panel";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function RenderStep({ data }: { data: AlgorithmData }) {
  const { workflow, outputs, generationRuns } = data;
  const output = outputs.find((item) => item.id === workflow.activeOutputId);
  return (
    <RenderPanel
      videoId={workflow.videoId}
      concurrencyVersion={workflow.concurrencyVersion}
      acceptedAnimationId={workflow.acceptedAnimationId}
      output={output ? { id: output.id, filePath: output.filePath, durationFrames: output.durationFrames, inputFingerprint: output.inputFingerprint, status: output.status, error: output.error } : undefined}
      outputRunError={generationRuns.find((run) => run.stage === "render" && run.status === "failed")?.error ?? undefined}
    />
  );
}
