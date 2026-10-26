import { GenerateSolution } from "@/components/algorithm/generate-solution";
import { RevisionReview } from "@/components/algorithm/revision-review";
import { SolutionEditor } from "@/components/algorithm/solution-editor";
import { SolutionSummary } from "@/components/algorithm/solution-summary";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function SolutionStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns } = data;
  const solution = revisions.find((revision) => revision.id === workflow.activeSolutionId);
  const run = solution?.generationRunId ? generationRuns.find((item) => item.id === solution.generationRunId) : undefined;
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      {workflow.acceptedProblemId ? (
        <>
          <GenerateSolution videoId={workflow.videoId} concurrencyVersion={workflow.concurrencyVersion} running={solution?.status === "generating"} blocked={solution?.status === "pending_review"} />
          {solution?.status === "failed" && <p className="text-sm text-destructive">Lần sinh lời giải lỗi; có thể yêu cầu LLM sinh lại.</p>}
          <SolutionEditor videoId={workflow.videoId} concurrencyVersion={workflow.concurrencyVersion} />
        </>
      ) : (
        <p className="text-muted-foreground">Duyệt một revision đề bài trước khi sinh lời giải.</p>
      )}
      {solution && (
        <div className="rounded-md bg-muted/40 p-3">
          <p className="mb-2">Lời giải v{solution.version} · {solution.status}{solution.source === "llm" ? ` · LLM${solution.model ? ` (${solution.model})` : ""}` : " · nhập tay"}</p>
          {solution.status === "generating" ? <p>Đang chờ worker tạo lời giải…</p> : <SolutionSummary content={solution.content} />}
          {run?.error && <p className="mt-2 text-xs text-destructive">{run.error}</p>}
          {solution.status === "pending_review" && (
            <div className="mt-4">
              <RevisionReview videoId={workflow.videoId} revisionId={solution.id} fingerprint={solution.inputFingerprint} concurrencyVersion={workflow.concurrencyVersion} source={solution.source} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
