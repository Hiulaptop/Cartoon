import type { JobPayload } from "@/lib/queue/jobs";

export type JobContext = { jobRunId: string; attempt: number; extendLock: (seconds: number) => Promise<void> };
// Giá trị trả về được ghi vào job_runs.metrics.
export type JobHandler = (payload: JobPayload, ctx: JobContext) => Promise<Record<string, unknown> | void>;

// Lỗi không nên thử lại (dữ liệu sai, thiếu cấu hình...): job chuyển `failed` ngay.
export class PermanentJobError extends Error {}

// Chưa làm được lúc này nhưng không phải lỗi (hết hạn mức ngày...): hẹn lại sau `seconds`, không tính vào số lần thử.
export class DeferredJobError extends Error {
  constructor(
    readonly seconds: number,
    reason: string,
  ) {
    super(reason);
  }
}
