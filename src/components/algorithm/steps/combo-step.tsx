import { ComboStage } from "@/components/algorithm/combo-stage";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function ComboStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns } = data;
  const combo = revisions.find((revision) => revision.id === workflow.activeComboId);
  const run = combo?.generationRunId ? generationRuns.find((item) => item.id === combo.generationRunId) : undefined;
  return (
    <>
      <ComboStage
        videoId={workflow.videoId}
        concurrencyVersion={workflow.concurrencyVersion}
        acceptedSolutionId={workflow.acceptedSolutionId}
        activeRevision={combo ? { id: combo.id, status: combo.status, source: combo.source, inputFingerprint: combo.inputFingerprint, content: combo.content } : undefined}
        acceptedComboId={workflow.acceptedComboId}
      />
      {run?.error && <p className="text-xs text-destructive">Lỗi job combo: {run.error}</p>}
    </>
  );
}
