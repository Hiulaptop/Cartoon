import { problemText } from "@/lib/algorithm/view";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";
import { ALGORITHM_STAGE_LABELS } from "@/lib/video/kind";

export function RevisionHistory({ data }: { data: AlgorithmData }) {
  return (
    <ol className="flex flex-col gap-3 text-sm">
      {data.revisions.map((revision) => {
        const inputs = data.inputs.filter((input) => input.revisionId === revision.id);
        const decisions = data.decisions.filter((decision) => decision.revisionId === revision.id);
        return (
          <li key={revision.id} className="rounded-md bg-muted/40 p-3">
            <div className="font-medium">
              {ALGORITHM_STAGE_LABELS[revision.stage]} · v{revision.version} · {revision.status} · {revision.source}
            </div>
            <div className="text-xs break-all text-muted-foreground">
              {revision.id} · fingerprint {revision.inputFingerprint}
            </div>
            {inputs.length > 0 && <p className="text-xs">Nguồn: {inputs.map((input) => input.inputRevisionId).join(", ")}</p>}
            {decisions.map((decision) => (
              <p key={decision.id} className="mt-1">
                {decision.decision === "approved" ? "Đã duyệt" : "Đã từ chối"}
                {decision.reason ? ` · ${decision.reason}` : ""}
              </p>
            ))}
            {revision.stage === "problem" && <p className="mt-2 whitespace-pre-wrap">{problemText(revision)}</p>}
          </li>
        );
      })}
    </ol>
  );
}
