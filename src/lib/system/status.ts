import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { queueLength } from "@/lib/queue/consume";
import { dataFileInfo } from "@/lib/storage";

export type Check = { ok: boolean; detail: string };
export type SystemStatus = { database: Check; queue: Check; nineRouter: Check; lastPing: Check };

export async function getSystemStatus(): Promise<SystemStatus> {
  let database: Check;
  let queue: Check;
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    database = { ok: true, detail: "Kết nối được" };
    queue = { ok: true, detail: `${await queueLength(db)} job đang chờ` };
  } catch (error) {
    database = { ok: false, detail: errorMessage(error) };
    queue = { ok: false, detail: "Chưa kiểm tra được (DB lỗi)" };
  }

  // Chỉ kiểm tra cấu hình; muốn gọi thật thì bấm "Kiểm tra 9router" (job system.llm_ping).
  const nineRouterReady = Boolean(process.env.NINE_ROUTER_BASE_URL && process.env.NINE_ROUTER_API_KEY);
  const nineRouter: Check = nineRouterReady
    ? { ok: true, detail: "Đã cấu hình" }
    : { ok: false, detail: "Thiếu NINE_ROUTER_BASE_URL / NINE_ROUTER_API_KEY" };

  // File do job system.ping ghi: chứng minh worker và app dùng chung DATA_DIR.
  const ping = await dataFileInfo("system/last-ping.json");
  const lastPing: Check = ping
    ? { ok: true, detail: timeAgo(ping.mtime) }
    : { ok: false, detail: "Chưa có, bấm Ping worker" };

  return { database, queue, nineRouter, lastPing };
}
