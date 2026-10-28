import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

// pg cho các tham số ssl* trong URL ghi đè object `ssl` bên dưới, nên bỏ chúng đi.
const SSL_URL_PARAMS = ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "sslnegotiation", "uselibpqcompat"];
const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "supabase_db_cartoon-local"]);

function createPool(): pg.Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Thiếu DATABASE_URL (xem .env.example)");
  const url = new URL(raw);
  const sslMode = process.env.DATABASE_SSL_MODE || "verify-full";
  if (sslMode !== "verify-full" && sslMode !== "disable") {
    throw new Error("DATABASE_SSL_MODE chỉ nhận verify-full hoặc disable");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (sslMode === "disable" && (!LOCAL_DB_HOSTS.has(hostname) || url.searchParams.has("host") || url.searchParams.has("hostaddr"))) {
    throw new Error("Chỉ được tắt TLS với database local của Cartoon");
  }
  for (const param of SSL_URL_PARAMS) url.searchParams.delete(param);

  // Cloud mặc định xác minh TLS; local phải chọn disable rõ ràng và qua allowlist ở trên.
  // DATABASE_CA_CERT là đường dẫn tính từ thư mục chạy (gốc repo, hoặc /app trong container).
  const caPath = process.env.DATABASE_CA_CERT;
  const ssl = sslMode === "disable"
    ? false
    : caPath
      ? { ca: readFileSync(path.resolve(caPath), "utf8"), rejectUnauthorized: true }
      : { rejectUnauthorized: true };

  return new pg.Pool({ connectionString: url.toString(), ssl, max: 5 });
}

// Một pool cho cả tiến trình. Lưu trên globalThis để Next dev (HMR) không tạo pool mới mỗi lần nạp lại module.
const globalForDb = globalThis as unknown as { cartoonPool?: pg.Pool; cartoonDb?: Db };

export function getPool(): pg.Pool {
  globalForDb.cartoonPool ??= createPool();
  return globalForDb.cartoonPool;
}

export function getDb(): Db {
  globalForDb.cartoonDb ??= drizzle({ client: getPool(), schema });
  return globalForDb.cartoonDb;
}
