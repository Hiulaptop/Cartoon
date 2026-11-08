import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { automationRuns as runs, automationVideos as videos } from "@/lib/db/schema";
import { readDataFile, writeDataFile } from "@/lib/storage";
import { PermitSchema, ProfileSchema } from "./contracts";
import { canonicalHash, sha256 } from "./fingerprint";
import type { ExpectedHead } from "./contracts";
import { lockVideo } from "./workflow";

const OperationSchema = z.strictObject({
  key: z.string(), requestHash: z.string(), token: z.uuid(),
  state: z.enum(["reserved", "in_flight", "succeeded", "failed", "uncertain"]),
  costKind: z.literal("unknown"), currency: z.string(), actual: z.null(), estimated: z.null(),
  resultPath: z.string(), resultHash: z.string().optional(), startedAt: z.string(),
  reconciliation: z.strictObject({ note: z.string().min(1).max(2000), at: z.string() }).optional(),
});
const LedgerSchema = z.record(z.string(), OperationSchema);
type Operation = z.infer<typeof OperationSchema>;

export async function reconcileOperation(expected: ExpectedHead, runId: string, key: string, note: string) {
  if (!note.trim() || note.length > 2000) throw new Error("Cần ghi kết quả đối soát và căn cứ (tối đa 2000 ký tự)");
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(814037)`);
    const video = await lockVideo(tx, expected);
    const active = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.videoId, video.id), sql`${runs.status} IN ('queued','running')`)).limit(1);
    if (active.length) throw new Error("Chỉ đối soát khi không còn lượt chạy hoạt động; xác nhận worker cũ đã dừng trước khi tiếp tục");
    const [run] = await tx.select().from(runs).where(and(eq(runs.id, z.uuid().parse(runId)), eq(runs.videoId, video.id))).for("update");
    if (!run) throw new Error("Run không thuộc video");
    const ledger = LedgerSchema.parse(run.operations);
    const op = ledger[key];
    if (!op || !["in_flight", "uncertain", "reserved"].includes(op.state)) throw new Error("Operation không cần đối soát");
    // Không biến kết quả không rõ thành succeeded, không xoá lịch sử hay khẳng định chưa bị tính tiền.
    ledger[key] = { ...op, state: "failed", reconciliation: { note: note.trim(), at: new Date().toISOString() } };
    await tx.update(runs).set({ operations: ledger }).where(eq(runs.id, run.id));
    await tx.update(videos).set({ lockVersion: video.lockVersion + 1 }).where(eq(videos.id, video.id));
  });
}

// Router không có price/output-cap contract đáng tin: không giả vờ số budget là hard cap.
export async function runPaidOperation(input: {
  runId: string; key: string; request: unknown; call: () => Promise<Uint8Array>;
}): Promise<Buffer> {
  if (process.env.AUTOMATION_EXECUTION_ENABLED !== "true") throw new Error("Automation chưa bật thực thi");
  const db = getDb();
  const requestHash = canonicalHash(input.request);
  const reservation = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(814037)`);
    const [owner] = await tx.select({ videoId: runs.videoId }).from(runs).where(eq(runs.id, input.runId));
    if (!owner) throw new Error("Run không tồn tại");
    const [video] = await tx.select().from(videos).where(eq(videos.id, owner.videoId)).for("update");
    const [run] = await tx.select().from(runs).where(eq(runs.id, input.runId)).for("update");
    if (!run || !video || video.archived || run.status !== "running") throw new Error("Run không còn hoạt động");
    const snapshot = z.object({ expected: z.object({ lockVersion: z.number().int() }), profile: ProfileSchema }).parse(run.inputSnapshot);
    if (video.lockVersion !== snapshot.expected.lockVersion) throw new Error("Đầu vào lượt chạy đã cũ");
    const permit = PermitSchema.parse(run.permit);
    const ledger = LedgerSchema.parse(run.operations);
    const previous = ledger[input.key];
    if (previous) {
      if (previous.requestHash !== requestHash) throw new Error("Operation key đã dùng cho yêu cầu khác");
      if (previous.state === "succeeded") return previous;
      if (previous.state === "in_flight" || previous.state === "uncertain") {
        ledger[input.key] = { ...previous, state: "uncertain" };
        await tx.update(runs).set({ operations: ledger }).where(eq(runs.id, run.id));
        return { ...previous, state: "uncertain" as const };
      }
      throw new Error("Operation đã được đặt trước; cần kiểm tra thủ công, không gửi lại");
    }
    if (Object.keys(ledger).length >= permit.maxCalls) throw new Error("Hết số request được cho phép cho lượt này");
    // Một kết quả không chắc chắn ở bất kỳ run nào của video chặn chi tiêu tiếp.
    const siblings = await tx.select({ operations: runs.operations }).from(runs).where(and(eq(runs.videoId, video.id), sql`${runs.id} <> ${run.id}`));
    if (siblings.some((row) => Object.values(LedgerSchema.parse(row.operations)).some((op) => op.state === "in_flight" || op.state === "uncertain"))) throw new Error("Có request cũ chưa đối soát. Không tự tạo chi phí mới.");
    const op: Operation = { key: input.key, requestHash, token: randomUUID(), state: "reserved", costKind: "unknown", currency: snapshot.profile.currency, actual: null, estimated: null, resultPath: `automation/private/operations/${run.id}/${sha256(input.key)}.bin`, startedAt: new Date().toISOString() };
    ledger[input.key] = op;
    await tx.update(runs).set({ operations: ledger }).where(eq(runs.id, run.id));
    return op;
  });
  if (reservation.state === "succeeded") {
    const bytes = await readDataFile(reservation.resultPath);
    if (sha256(bytes) !== reservation.resultHash) throw new Error("Kết quả operation bị đổi");
    return bytes;
  }
  if (reservation.state !== "reserved") throw new Error("Kết quả upstream chưa chắc chắn; cần đối soát thủ công, không thử lại");
  const update = async (state: Operation["state"], resultHash?: string) => {
    await db.transaction(async (tx) => {
      const [owner] = await tx.select({ videoId: runs.videoId }).from(runs).where(eq(runs.id, input.runId));
      if (!owner) throw new Error("Mất operation ledger");
      const [video] = await tx.select().from(videos).where(eq(videos.id, owner.videoId)).for("update");
      const [run] = await tx.select().from(runs).where(eq(runs.id, input.runId)).for("update");
      if (!run) throw new Error("Mất operation ledger");
      if (state === "in_flight") {
        const snapshot = z.object({ expected: z.object({ lockVersion: z.number().int() }) }).parse(run.inputSnapshot);
        if (!video || video.archived || run.status !== "running" || video.lockVersion !== snapshot.expected.lockVersion) throw new Error("Lượt chạy đã cũ trước khi gửi request");
      }
      const ledger = LedgerSchema.parse(run.operations);
      const op = ledger[input.key];
      if (!op || op.token !== reservation.token) throw new Error("Operation reservation đã đổi");
      if (state === "in_flight" && op.state !== "reserved") throw new Error("Operation không được phép gọi lại");
      if ((state === "succeeded" || state === "uncertain") && op.state !== "in_flight") throw new Error("Operation không còn sở hữu kết quả");
      ledger[input.key] = { ...op, state, ...(resultHash ? { resultHash } : {}) };
      await tx.update(runs).set({ operations: ledger }).where(eq(runs.id, run.id));
    });
  };
  await update("in_flight");
  try {
    const bytes = Buffer.from(await input.call());
    await writeDataFile(reservation.resultPath, bytes);
    await update("succeeded", sha256(bytes));
    return bytes;
  } catch (error) {
    await update("uncertain");
    throw error;
  }
}
