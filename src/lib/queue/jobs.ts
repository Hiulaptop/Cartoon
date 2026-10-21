import { desc, eq, sql } from "drizzle-orm";

import { getDb, type Db } from "@/lib/db/client";
import { jobRuns, targetType } from "@/lib/db/schema";

// Một hàng đợi pgmq cho mọi loại job; loại job nằm trong message.
export const JOB_QUEUE = "jobs";

// Mỗi mốc sau thêm loại job của mình vào đây (vd. "asset.generate" ở M2).
export const JOB_TYPES = ["system.ping", "system.llm_ping", "asset.generate_base", "asset.generate_variant", "script.generate"] as const;
export type JobType = (typeof JOB_TYPES)[number];
export type JobPayload = Record<string, unknown>;
export type JobTarget = { type: (typeof targetType.enumValues)[number]; id: string };
export type JobMessage = { jobRunId: string; type: JobType; payload: JobPayload };

export function isJobType(value: string): value is JobType {
  return (JOB_TYPES as readonly string[]).includes(value);
}

// Ghi job_runs và gửi message trong cùng một transaction: không có job nào nằm trong hàng đợi mà thiếu bản ghi theo dõi.
export async function enqueueJob(
  type: JobType,
  payload: JobPayload = {},
  target?: JobTarget,
  db: Db = getDb(),
): Promise<string> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(jobRuns)
      .values({ jobType: type, targetType: target?.type, targetId: target?.id })
      .returning({ id: jobRuns.id });
    const message: JobMessage = { jobRunId: run.id, type, payload };
    const sent = await tx.execute<{ msg_id: string }>(
      sql`SELECT pgmq.send(${JOB_QUEUE}, ${JSON.stringify(message)}::jsonb) AS msg_id`,
    );
    await tx
      .update(jobRuns)
      .set({ queueMsgId: Number(sent.rows[0].msg_id) })
      .where(eq(jobRuns.id, run.id));
    return run.id;
  });
}

export async function listRecentJobs(limit = 50, db: Db = getDb()) {
  return db.select().from(jobRuns).orderBy(desc(jobRuns.createdAt)).limit(limit);
}
