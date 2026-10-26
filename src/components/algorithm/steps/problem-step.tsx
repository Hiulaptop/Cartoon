import { ProblemChat } from "@/components/algorithm/problem-chat";
import { ProblemEditor } from "@/components/algorithm/problem-editor";
import { RevisionReview } from "@/components/algorithm/revision-review";
import { problemStory, problemText } from "@/lib/algorithm/view";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function ProblemStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns } = data;
  const problem = revisions.find((revision) => revision.id === workflow.activeProblemId);
  const run = problem?.generationRunId ? generationRuns.find((item) => item.id === problem.generationRunId) : undefined;
  const story = problemStory(problem);
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <h3 className="font-medium">Đề bài · v{problem?.version ?? 1} · {problem?.status ?? "draft"}{problem?.source === "llm" ? ` · AI${problem.model ? ` (${problem.model})` : ""}` : ""}</h3>
      <ProblemChat videoId={workflow.videoId} concurrencyVersion={workflow.concurrencyVersion} running={problem?.status === "generating"} />
      {problem?.status === "generating" && <p>Đang chờ worker viết truyện và ra đề…</p>}
      {problem?.status === "failed" && <p className="text-sm text-destructive">Lần viết truyện lỗi; có thể gửi lại chủ đề.</p>}
      {run?.error && <p className="text-xs text-destructive">{run.error}</p>}
      {story.story && (
        <div className="flex flex-col gap-3 whitespace-pre-wrap rounded-md bg-muted/40 p-3">
          <p><strong>Chủ đề:</strong> {story.theme}{story.topic ? ` · ${story.topic}` : ""}</p>
          <p><strong>Truyện:</strong> {story.story}</p>
          <p><strong>Mô hình hoá:</strong> {story.modeling}</p>
        </div>
      )}
      <ProblemEditor videoId={workflow.videoId} concurrencyVersion={workflow.concurrencyVersion} value={problemText(problem)} />
      {problem?.status === "pending_review" && (
        <RevisionReview videoId={workflow.videoId} revisionId={problem.id} fingerprint={problem.inputFingerprint} concurrencyVersion={workflow.concurrencyVersion} source={problem.source} />
      )}
    </div>
  );
}
