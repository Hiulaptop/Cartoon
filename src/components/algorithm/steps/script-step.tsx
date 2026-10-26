import { ScriptStage } from "@/components/algorithm/script-stage";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function ScriptStep({ data }: { data: AlgorithmData }) {
  const { workflow, video, revisions, generationRuns, assetRequests, assetJobRuns, catalog } = data;
  const script = revisions.find((revision) => revision.id === workflow.activeScriptId);
  const run = script?.generationRunId ? generationRuns.find((item) => item.id === script.generationRunId) : undefined;
  return (
    <ScriptStage
      videoId={workflow.videoId}
      concurrencyVersion={workflow.concurrencyVersion}
      acceptedComboId={workflow.acceptedComboId}
      activeRevision={script ? { id: script.id, status: script.status, source: script.source, inputFingerprint: script.inputFingerprint, content: script.content } : undefined}
      acceptedScriptId={workflow.acceptedScriptId}
      runError={run?.error ?? undefined}
      assetRequests={assetRequests
        .filter((request) => request.scriptRevisionId === script?.id)
        .map((request) => ({
          id: request.id, temporaryKey: request.temporaryKey, brief: request.brief, status: request.status, assetId: request.assetId, state: request.state, reason: request.reason,
          ...(() => {
            const variant = data.requestVariants.find((item) => item.assetId === request.assetId && item.state === request.state);
            return { assetName: variant?.assetName, variantStatus: variant?.status, imagePath: variant?.filePath ?? null };
          })(),
          error: assetJobRuns.find((job) => job.status === "failed" && (job.metrics as { requestId?: string } | null)?.requestId === request.id)?.error ?? undefined,
        }))}
      seriesId={video.seriesId}
      catalog={catalog.map((item) => ({ variantId: item.variantId, assetId: item.assetId, name: item.name, displayName: item.displayName, kind: item.kind, state: item.state, filePath: item.filePath }))}
    />
  );
}
