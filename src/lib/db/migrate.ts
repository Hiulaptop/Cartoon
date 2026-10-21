import { migrate } from "drizzle-orm/node-postgres/migrator";

import { getDb, getPool } from "./client";

// Áp dụng các migration trong ./drizzle. Chạy: `npm run db:migrate` (máy dev) hoặc service `migrate` (Docker).
async function main() {
  const started = performance.now();
  try {
    await migrate(getDb(), { migrationsFolder: "drizzle" });
    console.log(`Đã áp dụng migration (${(performance.now() - started).toFixed(0)}ms)`);
  } finally {
    await getPool().end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
