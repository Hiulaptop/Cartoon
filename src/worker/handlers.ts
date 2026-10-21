import { chat, requireModel } from "@/lib/ninerouter/client";
import type { JobPayload, JobType } from "@/lib/queue/jobs";
import { writeDataFile } from "@/lib/storage";

export type JobContext = { jobRunId: string; attempt: number };
// Giá trị trả về được ghi vào job_runs.metrics.
export type JobHandler = (payload: JobPayload, ctx: JobContext) => Promise<Record<string, unknown> | void>;

// Lỗi không nên thử lại (dữ liệu sai, thiếu cấu hình...): job chuyển `failed` ngay.
export class PermanentJobError extends Error {}

export const handlers: Record<JobType, JobHandler> = {
  // Kiểm tra đường app → hàng đợi → worker → DB, và worker ghi được vào DATA_DIR.
  "system.ping": async (_payload, ctx) => {
    const at = new Date().toISOString();
    await writeDataFile("system/last-ping.json", JSON.stringify({ at, jobRunId: ctx.jobRunId }));
    return { pongAt: at };
  },

  // Kiểm tra worker gọi được 9router; ghi model và số token vào metrics.
  "system.llm_ping": async () => {
    let model: string;
    try {
      model = requireModel("LLM_WRITER_MODEL");
    } catch (error) {
      throw new PermanentJobError(error instanceof Error ? error.message : String(error));
    }
    const res = await chat({
      model,
      messages: [{ role: "user", content: "Reply with exactly one word: pong" }],
      temperature: 0,
      timeoutMs: 60_000,
    });
    return { model: res.model, reply: res.content.trim().slice(0, 50), usage: res.usage };
  },
};
