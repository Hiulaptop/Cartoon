import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getPool, type Db } from "@/lib/db/client";

export type VariantKey = { assetId: string; state: string };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export class GenerationBusyError extends Error {}
function lockKey(value: string): string { return createHash("sha256").update(`cartoon:image:${value}`).digest().readBigInt64BE().toString(); }
export function variantLockKey(key: VariantKey): string { return lockKey(`${key.assetId}:${key.state}`); }
async function withLock<T>(key: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const controller = new AbortController();
  let acquired = false, broken = false;
  const onError = () => { broken = true; controller.abort(new Error("Mất khóa sinh ảnh")); };
  client.on("error", onError);
  try {
    const result = await client.query<{ acquired: boolean }>("SELECT pg_try_advisory_lock($1::bigint) AS acquired", [key]);
    acquired = result.rows[0].acquired;
    if (!acquired) throw new GenerationBusyError("Có công việc sinh ảnh đang giữ khóa; thử lại sau");
    const value = await fn(controller.signal);
    controller.signal.throwIfAborted();
    return value;
  } finally {
    if (acquired && !broken) {
      try { await client.query("SELECT pg_advisory_unlock($1::bigint)", [key]); } catch { broken = true; }
    }
    client.removeListener("error", onError);
    client.release(broken);
  }
}
export function withVariantGenerationLock<T>(key: VariantKey, fn: (signal: AbortSignal) => Promise<T>): Promise<T> { return withLock(variantLockKey(key), fn); }
export function withComfyExecutorLock<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> { return withLock(lockKey("comfy-executor"), fn); }
export async function lockVariantCommand(tx: Tx, key: VariantKey): Promise<void> {
  const result = await tx.execute<{ acquired: boolean }>(sql`SELECT pg_try_advisory_xact_lock(${variantLockKey(key)}::bigint) AS acquired`);
  if (!result.rows[0]?.acquired) throw new GenerationBusyError("Biến thể đang được xử lý; không đổi yêu cầu lúc này");
}
