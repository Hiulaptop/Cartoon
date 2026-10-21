"use server";

import { revalidatePath } from "next/cache";

import { errorMessage } from "@/lib/errors";
import { enqueueJob, type JobType } from "@/lib/queue/jobs";

export type EnqueueResult = { ok: true; jobRunId: string } | { ok: false; error: string };

async function enqueue(type: JobType): Promise<EnqueueResult> {
  try {
    const jobRunId = await enqueueJob(type);
    revalidatePath("/");
    revalidatePath("/jobs");
    return { ok: true, jobRunId };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function pingWorker(): Promise<EnqueueResult> {
  return enqueue("system.ping");
}

export async function pingNineRouter(): Promise<EnqueueResult> {
  return enqueue("system.llm_ping");
}
