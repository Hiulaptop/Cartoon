import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { scripts, validations, videos } from "@/lib/db/schema";
import { extractJson } from "@/lib/llm/json";
import { chat, requireModel } from "@/lib/ninerouter/client";
import type { JobPayload } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { checkScript } from "@/lib/script/check";
import { ensureDefaultCombo } from "@/lib/script/combo";
import { scriptMessages } from "@/lib/script/prompts";
import { scriptContentSchema, scriptSchema, type ScriptContent } from "@/lib/script/schema";

import { PermanentJobError } from "./job-types";

const MAX_WRITES = 3; // lần viết đầu + tối đa 2 lần sinh lại khi sai lớp 1 (spec §6)
const RUBRIC = "l1-script-v1";

// Bước 2: viết kịch bản cho một phiên bản `scripts` đã được app tạo sẵn (idempotent theo scriptId).
export async function generateScript(payload: JobPayload) {
  const scriptId = typeof payload.scriptId === "string" ? payload.scriptId : "";
  if (!scriptId) throw new PermanentJobError('Payload thiếu "scriptId"');
  const db = getDb();
  const [row] = await db.select().from(scripts).where(eq(scripts.id, scriptId)).limit(1);
  if (!row) throw new PermanentJobError(`Không có script ${scriptId}`);
  const parsedContent = scriptContentSchema.safeParse(row.content);
  if (!parsedContent.success) throw new PermanentJobError("scripts.content thiếu meta");
  const { meta } = parsedContent.data;
  const [video] = await db.select().from(videos).where(eq(videos.id, row.videoId)).limit(1);
  if (!video) throw new PermanentJobError("Không có video của kịch bản này");

  const catalog = await loadApprovedCatalog(video.seriesId);
  const missing = meta.assetNames.filter((n) => !catalog.has(n));
  if (missing.length) throw new PermanentJobError(`Asset chưa duyệt hoặc không tồn tại: ${missing.join(", ")}`);
  const { definition: combo } = await ensureDefaultCombo();
  const model = requireModel("LLM_WRITER_MODEL");

  await db.update(scripts).set({ status: "generating", model }).where(eq(scripts.id, scriptId));

  let feedback = meta.feedback;
  let previous: string | undefined;
  let usage: unknown[] = [];
  let finalContent: ScriptContent = { meta };
  let passed = false;

  for (let attempt = 1; attempt <= MAX_WRITES && !passed; attempt++) {
    const res = await chat({
      model,
      temperature: 0.8,
      timeoutMs: 180_000,
      messages: scriptMessages({
        brief: video.brief,
        targetSeconds: meta.targetSeconds,
        assetNames: meta.assetNames,
        catalog,
        combo,
        feedback,
        previous,
      }),
    });
    usage = [...usage, { attempt, model: res.model, ...res.usage }];

    let issues: string[];
    let script: ScriptContent["script"];
    try {
      const parsed = scriptSchema.safeParse(extractJson(res.content));
      if (parsed.success) {
        script = parsed.data;
        issues = checkScript(parsed.data, catalog, combo);
      } else {
        issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`);
      }
    } catch (error) {
      issues = [`Phản hồi không phải JSON hợp lệ: ${error instanceof Error ? error.message : String(error)}`];
    }

    passed = issues.length === 0;
    await db.insert(validations).values({
      targetType: "script",
      targetId: scriptId,
      validatorModel: "layer1",
      rubricVersion: RUBRIC,
      scores: { attempt, issues },
      verdict: passed ? "pass" : "fail",
      feedback: issues.join("\n"),
    });
    finalContent = { meta, script, issues: passed ? undefined : issues };
    if (!passed) {
      previous = script ? JSON.stringify(script) : undefined;
      feedback = [meta.feedback, ...issues.slice(0, 15)].filter(Boolean).join("\n");
    }
  }

  await db
    .update(scripts)
    .set({ content: finalContent, status: passed ? "pending_review" : "failed" })
    .where(eq(scripts.id, scriptId));
  return { passed, attempts: usage.length, llm: usage };
}
