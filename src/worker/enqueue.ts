import { getPool } from "@/lib/db/client";
import { enqueueJob, isJobType, JOB_TYPES } from "@/lib/queue/jobs";

// Đẩy một job vào hàng đợi từ dòng lệnh: `npm run job -- system.ping`
async function main() {
  const type = process.argv[2] ?? "";
  if (!isJobType(type)) {
    throw new Error(`Loại job không hợp lệ "${type}". Hợp lệ: ${JOB_TYPES.join(", ")}`);
  }
  try {
    const jobRunId = await enqueueJob(type);
    console.log(`Đã xếp hàng ${type}: job_runs.id = ${jobRunId}`);
  } finally {
    await getPool().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
