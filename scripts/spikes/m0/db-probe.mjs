import pg from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Thiếu DATABASE_URL trong .env");
console.log("DATABASE_URL: đã đọc");

const QUEUE = "m0_probe";
const SCHEMA = "m0_probe_lg";
const pool = new pg.Pool({ connectionString: url, max: 3 });

async function q(label, sql, params = []) {
  const started = performance.now();
  const res = await pool.query(sql, params);
  console.log(`${label}: ${(performance.now() - started).toFixed(0)}ms, rows=${res.rowCount}`);
  return res;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await q("version", "select version()");

  // pgmq: tạo hàng đợi, kiểm tra thời gian ẩn (visibility timeout) để biết job lỗi có tự hiện lại không
  await q("create extension", "create extension if not exists pgmq");
  await q("create queue", "select pgmq.create($1)", [QUEUE]);
  const sent = await q("send", "select * from pgmq.send($1, $2::jsonb)", [QUEUE, JSON.stringify({ hello: "m0" })]);
  const msgId = sent.rows[0].send;

  const first = await q("read vt=2s", "select * from pgmq.read($1, $2, $3)", [QUEUE, 2, 1]);
  const hidden = await q("read ngay sau (mong đợi 0 dòng)", "select * from pgmq.read($1, $2, $3)", [QUEUE, 2, 1]);
  await sleep(3000);
  const again = await q("read sau 3s (mong đợi 1 dòng)", "select * from pgmq.read($1, $2, $3)", [QUEUE, 2, 1]);
  console.log(
    `pgmq: lần1=${first.rowCount}, ẩn=${hidden.rowCount}, hiện lại=${again.rowCount}, read_ct=${again.rows[0]?.read_ct}`,
  );
  await q("archive", "select pgmq.archive($1, $2::bigint)", [QUEUE, msgId]);

  // LangGraph checkpoint trong schema riêng để dọn sạch được
  await q("create schema", `create schema if not exists ${SCHEMA}`);
  const saver = new PostgresSaver(pool, undefined, { schema: SCHEMA });
  const setupStarted = performance.now();
  await saver.setup();
  console.log(`PostgresSaver.setup: ${(performance.now() - setupStarted).toFixed(0)}ms`);

  const State = Annotation.Root({ count: Annotation() });
  const graph = new StateGraph(State)
    .addNode("inc", (s) => ({ count: s.count + 1 }))
    .addEdge(START, "inc")
    .addEdge("inc", END)
    .compile({ checkpointer: saver });
  const config = { configurable: { thread_id: "m0" } };
  await graph.invoke({ count: 41 }, config);
  const snap = await graph.getState(config);
  console.log(`LangGraph state sau khi đọc lại từ Postgres: count=${snap.values.count} (mong đợi 42)`);
} finally {
  await pool.query("select pgmq.drop_queue($1)", [QUEUE]).catch((e) => console.log("drop queue:", e.message));
  await pool.query(`drop schema if exists ${SCHEMA} cascade`).catch((e) => console.log("drop schema:", e.message));
  console.log("Đã dọn hàng đợi và schema thử");
  await pool.end();
}
