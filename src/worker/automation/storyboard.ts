import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { automationRevisions } from "@/lib/db/schema";
import { ResearchSchema, StoryboardSchema } from "@/lib/automation/contracts";
import { checkStoryboard } from "@/lib/automation/checks";
import { checkVisuals } from "@/lib/automation/visual";
import type { JobHandler } from "../job-types";
import { generateAutomationStructured } from "./llm";
import { guardJob, publishRevision } from "./run-guard";

export const generateAutomationStoryboard: JobHandler = (payload, ctx) => guardJob(payload, ctx, async (context) => {
  if (!context.snapshot.researchId) throw new Error("Thiếu research đã duyệt");
  const [revision] = await getDb().select().from(automationRevisions).where(and(eq(automationRevisions.id, context.snapshot.researchId), eq(automationRevisions.videoId, context.video.id)));
  if (!revision || revision.stale) throw new Error("Research đã cũ");
  const research = ResearchSchema.parse(revision.content);
  const result = await generateAutomationStructured({ context, ctx, schema: StoryboardSchema,
    instructions: "Write a 4–6 minute horizontal explainer for curious adults, one central idea with hook, mechanism, concrete walkthrough, limits and recap. Use only approved claims; no new facts. The renderer supports 8 fixed slots, 4 columns and 2 rows; labels <=48 characters, callouts <=70. All IDs globally unique. Declarative operations only, chronological from/to relative to a spoken cue. counter.set supports only the current total waiting queue item count computed from preceding queue operations, with exact unit đang chờ; no arbitrary numbers. Provide 15–30 seconds of consecutive cues in the preview scene. Give objects meaningful types and animate mechanism, not generic title slides. Every assumption must be visibly labeled. Each visible cue must fit at most two lines of 42 characters, split longer narration into more cues. Spoken Vietnamese should sound natural; no code or external media.",
    data: { brief: context.brief, profile: context.profile, research, feedback: context.snapshot.feedback },
    check: (storyboard) => [...checkStoryboard(storyboard, research), ...checkVisuals(storyboard)],
  });
  await publishRevision(context, "storyboard", result.data, { model: result.model, usage: result.usage });
});
