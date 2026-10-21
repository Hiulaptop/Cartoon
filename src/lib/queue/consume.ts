import { sql } from "drizzle-orm";

import type { Db } from "@/lib/db/client";

import { JOB_QUEUE } from "./jobs";

// Một bản ghi pgmq.message_record. `message` là JSON thô: worker phải tự kiểm tra trước khi tin.
export type QueueRecord = { msg_id: string; read_ct: number; message: unknown };

// Đọc 1 message và ẩn nó trong `vtSeconds`. Worker chết giữa chừng thì message tự hiện lại sau thời gian đó.
export async function readJob(db: Db, vtSeconds: number): Promise<QueueRecord | null> {
  const res = await db.execute<QueueRecord>(
    sql`SELECT msg_id, read_ct, message FROM pgmq.read(${JOB_QUEUE}, ${vtSeconds}::integer, 1)`,
  );
  return res.rows[0] ?? null;
}

export async function archiveJob(db: Db, msgId: string): Promise<void> {
  await db.execute(sql`SELECT pgmq.archive(${JOB_QUEUE}, ${msgId}::bigint)`);
}

// set_vt có bản nạp chồng (integer | timestamptz): phải ép kiểu, nếu không Postgres báo mơ hồ.
export async function retryJobIn(db: Db, msgId: string, seconds: number): Promise<void> {
  await db.execute(sql`SELECT pgmq.set_vt(${JOB_QUEUE}, ${msgId}::bigint, ${seconds}::integer)`);
}

export async function queueLength(db: Db): Promise<number> {
  const res = await db.execute<{ queue_length: string }>(
    sql`SELECT queue_length FROM pgmq.metrics(${JOB_QUEUE})`,
  );
  return Number(res.rows[0]?.queue_length ?? 0);
}
