import type { JobPayload } from "@/lib/queue/jobs";

export type JobContext = { jobRunId: string; attempt: number };
// Giá trị trả về được ghi vào job_runs.metrics.
export type JobHandler = (payload: JobPayload, ctx: JobContext) => Promise<Record<string, unknown> | void>;

// Lỗi không nên thử lại (dữ liệu sai, thiếu cấu hình...): job chuyển `failed` ngay.
export class PermanentJobError extends Error {}
