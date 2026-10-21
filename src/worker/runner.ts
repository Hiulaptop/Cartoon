import { eq } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { jobRuns } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import { archiveJob, readJob, retryJobIn } from "@/lib/queue/consume";
import { isJobType, type JobMessage } from "@/lib/queue/jobs";

import { handlers, PermanentJobError } from "./handlers";

// Job phải xong trong khoảng này; quá hạn thì coi như worker đã chết và message hiện lại cho lần thử sau.
export const VISIBILITY_TIMEOUT_SECONDS = 300;
export const MAX_ATTEMPTS = 3;
// Lần thử thứ n (n ≥ 1) thất bại thì chờ 10s · 2^(n-1) trước lần sau.
const RETRY_BASE_SECONDS = 10;

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

function parseMessage(raw: unknown): JobMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.jobRunId !== "string" || typeof m.type !== "string" || !isJobType(m.type)) return null;
  const payload = typeof m.payload === "object" && m.payload !== null ? (m.payload as JobMessage["payload"]) : {};
  return { jobRunId: m.jobRunId, type: m.type, payload };
}

// Xử lý tối đa một job. Trả về false khi hàng đợi trống.
export async function processOne(db: Db): Promise<boolean> {
  const record = await readJob(db, VISIBILITY_TIMEOUT_SECONDS);
  if (!record) return false;

  const { msg_id: msgId, read_ct: attempt } = record;
  const job = parseMessage(record.message);
  if (!job) {
    log("job.malformed", { msgId });
    await archiveJob(db, msgId);
    return true;
  }

  const where = eq(jobRuns.id, job.jobRunId);
  await db.update(jobRuns).set({ status: "running", attempts: attempt, startedAt: new Date(), error: null }).where(where);
  log("job.start", { jobRunId: job.jobRunId, type: job.type, attempt });
  const started = performance.now();

  try {
    const metrics = (await handlers[job.type](job.payload, { jobRunId: job.jobRunId, attempt })) ?? {};
    const durationMs = Math.round(performance.now() - started);
    await db
      .update(jobRuns)
      .set({ status: "succeeded", finishedAt: new Date(), metrics: { ...metrics, durationMs } })
      .where(where);
    await archiveJob(db, msgId);
    log("job.succeeded", { jobRunId: job.jobRunId, type: job.type, durationMs });
  } catch (error) {
    const message = errorMessage(error);
    const permanent = error instanceof PermanentJobError || attempt >= MAX_ATTEMPTS;
    if (permanent) {
      await db.update(jobRuns).set({ status: "failed", finishedAt: new Date(), error: message }).where(where);
      await archiveJob(db, msgId);
      log("job.failed", { jobRunId: job.jobRunId, type: job.type, attempt, error: message });
    } else {
      const retryIn = RETRY_BASE_SECONDS * 2 ** (attempt - 1);
      await db.update(jobRuns).set({ status: "queued", error: message }).where(where);
      await retryJobIn(db, msgId, retryIn);
      log("job.retry", { jobRunId: job.jobRunId, type: job.type, attempt, retryIn, error: message });
    }
  }
  return true;
}
