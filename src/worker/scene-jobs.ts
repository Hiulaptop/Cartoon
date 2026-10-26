import { and, eq, inArray } from "drizzle-orm";

import { getDb, getPool } from "@/lib/db/client";
import { scenes, scripts, validations, videos } from "@/lib/db/schema";
import { assertDifferentFamily, RUBRIC_VERSION } from "@/lib/judge/rubric";
import { requireModel } from "@/lib/ninerouter/client";
import type { JobPayload } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { planScenes } from "@/lib/scene/plan";
import { scriptContentSchema } from "@/lib/script/schema";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { PermanentJobError, type JobContext } from "./job-types";
import { buildSceneGraph, type SceneOutcome } from "./scene-graph";

const CHECKPOINT_SCHEMA = "langgraph";

let saver: PostgresSaver | null = null;
async function getSaver(): Promise<PostgresSaver> {
  if (!saver) {
    await getPool().query(`create schema if not exists ${CHECKPOINT_SCHEMA}`);
    saver = new PostgresSaver(getPool(), undefined, { schema: CHECKPOINT_SCHEMA });
    await saver.setup();
  }
  return saver;
}

// Bước 3: sinh JSON cảnh cho kịch bản đã duyệt. thread_id = jobRunId: job thử lại sẽ chạy tiếp từ checkpoint.
export async function generateScenes(payload: JobPayload, ctx: JobContext) {
  const scriptId = typeof payload.scriptId === "string" ? payload.scriptId : "";
  if (!scriptId) throw new PermanentJobError('Payload thiếu "scriptId"');
  const only = Array.isArray(payload.positions) ? (payload.positions as number[]) : null;
  const humanFeedback = Object.fromEntries(Object.entries((payload.humanFeedback ?? {}) as Record<string, string>).map(([k, v]) => [Number(k), v]));

  const db = getDb();
  const [row] = await db.select().from(scripts).where(eq(scripts.id, scriptId)).limit(1);
  const content = row && scriptContentSchema.safeParse(row.content);
  if (!row || row.status !== "approved" || !content?.success || !content.data.script) {
    throw new PermanentJobError("Kịch bản chưa được duyệt hoặc thiếu nội dung");
  }
  const writerModel = requireModel("LLM_WRITER_MODEL");
  const judgeModel = requireModel("LLM_JUDGE_MODEL");
  let sameFamily = false;
  try {
    sameFamily = assertDifferentFamily(writerModel, judgeModel);
    if (sameFamily) console.warn(JSON.stringify({ event: "judge.same_family", writerModel, judgeModel }));
  } catch (error) {
    throw new PermanentJobError(error instanceof Error ? error.message : String(error));
  }

  const [video] = await db.select().from(videos).where(eq(videos.id, row.videoId)).limit(1);
  if (!video || video.kind !== "cartoon") throw new PermanentJobError("Không có video hoạt hình của kịch bản này");
  const catalog = await loadApprovedCatalog(video.seriesId);
  const plans = planScenes(content.data.script).filter((p) => !only || only.includes(p.position));
  const checkpointer = await getSaver();
  const graph = buildSceneGraph({ catalog, writerModel, judgeModel, checkpointer, humanFeedback });
  const config = { configurable: { thread_id: ctx.jobRunId }, recursionLimit: 60 };

  const existing = await graph.getState(config);
  const resumable = existing.next.length > 0;
  const initial = { scenes: Object.fromEntries(plans.map((p) => [p.position, { plan: p, status: "pending", history: [] } satisfies SceneOutcome])) };
  const result = resumable ? await graph.invoke(null, config) : await graph.invoke(initial, config);

  const outcomes = Object.values(result.scenes) as SceneOutcome[];
  const positions = outcomes.map((o) => o.plan.position);
  // Ghi đè các cảnh cùng vị trí (sinh lại); giữ nguyên cảnh khác.
  await db.transaction(async (tx) => {
    const old = await tx.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.scriptId, scriptId), inArray(scenes.position, positions)));
    if (old.length) await tx.delete(scenes).where(inArray(scenes.id, old.map((s) => s.id)));
    for (const o of outcomes) {
      const [created] = await tx
        .insert(scenes)
        .values({
          videoId: row.videoId,
          scriptId,
          position: o.plan.position,
          dsl: o.dsl ?? null,
          dslVersion: 1,
          durationFrames: o.dsl?.durationFrames ?? null,
          status: o.status === "pass" ? "pending_review" : "failed",
        })
        .returning({ id: scenes.id });
      if (o.history.length) {
        await tx.insert(validations).values(
          o.history.map((h) => ({
            targetType: "scene" as const,
            targetId: created.id,
            validatorModel: h.model,
            rubricVersion: h.stage === "judge" ? RUBRIC_VERSION : "l1-scene-v1",
            scores: { round: h.round, stage: h.stage, detail: h.detail, sameFamily: h.stage === "judge" ? sameFamily : undefined },
            verdict: h.verdict,
            feedback: h.feedback,
          })),
        );
      }
    }
  });

  return { scenes: outcomes.length, passed: outcomes.filter((o) => o.status === "pass").length, writerModel, judgeModel };
}
