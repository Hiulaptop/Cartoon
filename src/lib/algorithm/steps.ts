import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";
import type { UiStatus } from "@/lib/ui/status";

export type StepKey = "problem" | "solution" | "combo" | "script" | "voice" | "animation" | "render";

// Workflow không đi qua stage "assets": asset được gắn ngay trong bước kịch bản (pipeline.ts).
export const STEPS: readonly { key: StepKey; label: string; requires: StepKey | null }[] = [
  { key: "problem", label: "Đề bài", requires: null },
  { key: "solution", label: "Lời giải", requires: "problem" },
  { key: "combo", label: "Combo", requires: "solution" },
  { key: "script", label: "Kịch bản", requires: "combo" },
  { key: "voice", label: "Voice", requires: "script" },
  { key: "animation", label: "Animation", requires: "voice" },
  { key: "render", label: "Video", requires: "animation" },
];

export type StepState = { key: StepKey; label: string; status: UiStatus; lockedReason?: string };

export const isStepKey = (value: string): value is StepKey => STEPS.some((step) => step.key === value);

const POINTERS = {
  problem: { active: "activeProblemId", accepted: "acceptedProblemId" },
  solution: { active: "activeSolutionId", accepted: "acceptedSolutionId" },
  combo: { active: "activeComboId", accepted: "acceptedComboId" },
  script: { active: "activeScriptId", accepted: "acceptedScriptId" },
  voice: { active: "activeVoiceId", accepted: "acceptedVoiceId" },
  animation: { active: "activeAnimationId", accepted: "acceptedAnimationId" },
} as const;

type Revision = AlgorithmData["revisions"][number];
type Run = AlgorithmData["generationRuns"][number];

function revisionStatus(revision: Revision | undefined, run: Run | undefined): UiStatus {
  if (!revision) return "todo";
  if (revision.status === "approved") return "done";
  if (revision.status === "generating" || run?.status === "queued" || run?.status === "running") return "running";
  if (revision.status === "pending_review") return "review";
  if (revision.status === "failed") return "failed";
  if (revision.status === "stale") return "stale";
  return "todo"; // draft, rejected
}

function ownStatus(key: StepKey, data: AlgorithmData): UiStatus {
  const { workflow, revisions, generationRuns, outputs, assetRequests } = data;
  if (key === "render") {
    const output = outputs.find((item) => item.id === workflow.activeOutputId);
    if (!output) return "todo";
    if (output.status === "generating") return "running";
    if (output.status === "pending_review") return "review";
    if (output.status === "approved") return "done";
    if (output.status === "failed") return "failed";
    if (output.status === "stale") return "stale";
    return "todo";
  }
  const revision = revisions.find((item) => item.id === workflow[POINTERS[key].active]);
  const run = revision?.generationRunId ? generationRuns.find((item) => item.id === revision.generationRunId) : undefined;
  const status = revisionStatus(revision, run);
  if (key === "script" && revision && status !== "done" && assetRequests.some((request) => request.scriptRevisionId === revision.id && request.status === "generating")) return "running";
  return status;
}

// Revision hiện hành của một bước (bước render không có revision).
export function activeRevisionOf(data: AlgorithmData, key: StepKey): Revision | undefined {
  if (key === "render") return undefined;
  return data.revisions.find((item) => item.id === data.workflow[POINTERS[key].active]);
}

export function deriveStepStates(data: AlgorithmData): StepState[] {
  const { workflow } = data;
  const acceptedPointer: Record<StepKey, string | null> = {
    problem: workflow.acceptedProblemId,
    solution: workflow.acceptedSolutionId,
    combo: workflow.acceptedComboId,
    script: workflow.acceptedScriptId,
    voice: workflow.acceptedVoiceId,
    animation: workflow.acceptedAnimationId,
    render: workflow.acceptedOutputId,
  };
  return STEPS.map((step) => {
    const own = ownStatus(step.key, data);
    if (step.requires && !acceptedPointer[step.requires]) {
      const previous = STEPS.find((item) => item.key === step.requires)!;
      // Có revision riêng nhưng đầu vào không còn được duyệt: bản cũ, không phải "đã duyệt".
      if (own === "done") return { key: step.key, label: step.label, status: "stale" as const };
      if (own !== "todo") return { key: step.key, label: step.label, status: own };
      return { key: step.key, label: step.label, status: "locked" as const, lockedReason: `Cần duyệt "${previous.label}" trước` };
    }
    return { key: step.key, label: step.label, status: own };
  });
}

// Bước đầu tiên đã mở mà chưa xong; nếu tất cả xong thì bước cuối.
export function pickCurrentStep(states: StepState[]): StepKey {
  return states.find((state) => state.status !== "locked" && state.status !== "done")?.key ?? "render";
}

export const NEXT_ACTION: Record<UiStatus, (label: string) => string> = {
  locked: (label) => `Chưa thể làm "${label}".`,
  todo: (label) => `Việc tiếp theo: bắt đầu bước "${label}".`,
  running: (label) => `Worker đang xử lý "${label}". Trang sẽ tự cập nhật khi xong.`,
  review: (label) => `Việc tiếp theo: xem lại và duyệt "${label}".`,
  done: (label) => `"${label}" đã được duyệt.`,
  failed: (label) => `"${label}" gặp lỗi. Xem thông báo lỗi bên dưới rồi thử lại hoặc chỉnh đầu vào.`,
  stale: (label) => `"${label}" đã cũ vì bước trước thay đổi. Tạo lại bản mới.`,
};
