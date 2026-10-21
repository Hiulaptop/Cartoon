import { chat, requireModel } from "@/lib/ninerouter/client";
import type { JobType } from "@/lib/queue/jobs";
import { writeDataFile } from "@/lib/storage";

import { generateBase, generateVariant } from "./asset-jobs";
import { generateScript } from "./script-jobs";
import { generateScenes } from "./scene-jobs";
import { renderVideo } from "./render-jobs";
import { suggestMetadata, uploadYoutube } from "./upload-jobs";
import { proposeCasting } from "./casting-jobs";
import { PermanentJobError, type JobHandler } from "./job-types";

export { PermanentJobError };

export const handlers: Record<JobType, JobHandler> = {
  // Kiểm tra đường app → hàng đợi → worker → DB, và worker ghi được vào DATA_DIR.
  "system.ping": async (_payload, ctx) => {
    const at = new Date().toISOString();
    await writeDataFile("system/last-ping.json", JSON.stringify({ at, jobRunId: ctx.jobRunId }));
    return { pongAt: at };
  },

  // Kiểm tra worker gọi được 9router; ghi model và số token vào metrics.
  "system.llm_ping": async () => {
    let model: string;
    try {
      model = requireModel("LLM_WRITER_MODEL");
    } catch (error) {
      throw new PermanentJobError(error instanceof Error ? error.message : String(error));
    }
    const res = await chat({
      model,
      messages: [{ role: "user", content: "Reply with exactly one word: pong" }],
      temperature: 0,
      timeoutMs: 60_000,
    });
    return { model: res.model, reply: res.content.trim().slice(0, 50), usage: res.usage };
  },

  // Bước 1 (M2): asset.
  "asset.generate_base": generateBase,
  "asset.generate_variant": generateVariant,
  "script.generate": generateScript,
  "scenes.generate": generateScenes,
  "video.render": renderVideo,
  "upload.youtube": uploadYoutube,
  "upload.suggest_metadata": suggestMetadata,
  "casting.propose": proposeCasting,
};
