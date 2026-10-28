"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/form";
import { createTtsTake, reviewTake, saveTimelineVersion, reviewTimeline } from "@/lib/audio/repository";
import { resolveTtsModel } from "@/lib/ninerouter/tts";

const text = (f: FormData, key: string) => String(f.get(key) ?? "").trim();
async function action(form: FormData, work: (videoId: string) => Promise<unknown>): Promise<FormState> {
  try { const videoId = z.uuid().parse(text(form, "videoId")); await work(videoId); revalidatePath(`/designs/${videoId}/voiceover`); revalidatePath(`/designs/${videoId}/render`); return {}; }
  catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { error: /^(Timeline|Cảnh|Bản thu|Chỉ duyệt|Lý do|Request ID|Model\/voice|Văn bản|Cần duyệt|Không có design|ID clip|Tối đa|Các clip|File audio)/.test(message) ? message : "Không thể lưu thay đổi; kiểm tra dữ liệu hoặc kết nối database" };
  }
}
export async function requestTtsTake(_prev: FormState, form: FormData): Promise<FormState> {
  return action(form, async (videoId) => {
    const model = await resolveTtsModel(text(form, "modelId"));
    const speech = z.string().min(1).max(model.maxCharacters).parse(text(form, "text"));
    return createTtsTake({ videoId, requestId: z.uuid().parse(text(form, "requestId")), label: z.string().min(1).max(120).parse(text(form, "label")), speakerRef: z.string().max(120).parse(text(form, "speakerRef")) || undefined, text: speech, modelMetadata: { modelId: model.modelId, label: model.label } });
  });
}
export async function reviewAudioTake(_prev: FormState, form: FormData): Promise<FormState> {
  return action(form, (videoId) => reviewTake(videoId, z.uuid().parse(text(form, "takeId")), z.enum(["approved", "rejected"]).parse(text(form, "decision")), text(form, "reason")));
}
export async function saveVoiceoverTimeline(_prev: FormState, form: FormData): Promise<FormState> {
  return action(form, (videoId) => saveTimelineVersion(videoId, JSON.parse(text(form, "content")), text(form, "expectedLatestVersionId") ? z.uuid().parse(text(form, "expectedLatestVersionId")) : null));
}
export async function reviewVoiceoverTimeline(_prev: FormState, form: FormData): Promise<FormState> {
  return action(form, (videoId) => reviewTimeline(videoId, z.uuid().parse(text(form, "timelineId")), z.enum(["approved", "rejected"]).parse(text(form, "decision")), text(form, "reason")));
}
