export type RunStatus = "queued" | "running" | "waiting_review" | "succeeded" | "failed" | "stale";

export type RunActivity = {
  id: string;
  stage: string;
  status: RunStatus;
  attempts: number;
  startedAt: string | null;
  updatedAt: string;
  error: string | null;
};

export type DesignActivity = {
  serverTime: string;
  runs: RunActivity[];
  output: { id: string; status: string; updatedAt: string; error: string | null } | null;
  assetRequests: { id: string; status: string }[];
  active: boolean;
};

export type ActivityEvent = {
  id: string;
  designId: string;
  title: string;
  stage: string;
  kind: "running" | "ready" | "failed";
  at: string;
};

// Runner đánh dấu failed ở lần thử thứ 3 (CLAUDE.md, mục Job).
export const MAX_JOB_ATTEMPTS = 3;

export function isDesignActive(a: Omit<DesignActivity, "active">): boolean {
  return (
    a.runs.some((run) => run.status === "queued" || run.status === "running") ||
    a.output?.status === "generating" ||
    a.assetRequests.some((request) => request.status === "generating")
  );
}

// Chữ ký thay đổi khi một run/output/asset chuyển trạng thái; dùng để quyết định có router.refresh() hay không.
export function activitySignature(a: DesignActivity): string {
  return JSON.stringify([
    a.runs.map((run) => [run.id, run.status, run.attempts]),
    a.output ? [a.output.id, a.output.status] : null,
    a.assetRequests.map((request) => [request.id, request.status]),
  ]);
}
