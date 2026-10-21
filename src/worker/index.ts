import { getDb, getPool } from "@/lib/db/client";
import { errorMessage } from "@/lib/errors";

import { log, processOne } from "./runner";

// Tiến trình worker: lấy job từ hàng đợi pgmq và xử lý tuần tự.
// Chạy: `npm run worker` (máy dev) hoặc service `worker` (Docker).
const IDLE_DELAY_MS = 1000;
const ERROR_DELAY_MS = 5000;

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    log("worker.stopping", { signal });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  log("worker.started");
  const db = getDb();
  while (!stopping) {
    try {
      const worked = await processOne(db);
      if (!worked) await sleep(IDLE_DELAY_MS);
    } catch (error) {
      // Lỗi hạ tầng (mất kết nối DB...): đợi rồi thử lại, không thoát tiến trình.
      log("worker.loop_error", { error: errorMessage(error) });
      await sleep(ERROR_DELAY_MS);
    }
  }
  await getPool().end();
  log("worker.stopped");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
