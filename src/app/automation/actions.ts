"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/lib/form";
import { BriefSchema, ProfileSchema, RUN_STAGES } from "@/lib/automation/contracts";
import { addWork, applyProfile, approve, archive, createVideo, editStoryboard, revise, saveProfile, startStage } from "@/lib/automation/workflow";
import { reconcileOperation } from "@/lib/automation/usage";

const value = (form: FormData, key: string) => String(form.get(key) ?? "");
const lines = (form: FormData, key: string) => value(form, key).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const head = (form: FormData) => ({ videoId: z.uuid().parse(value(form, "videoId")), lockVersion: z.coerce.number().int().positive().parse(value(form, "lockVersion")) });
const brief = (form: FormData) => BriefSchema.parse({ question: value(form, "question"), angle: value(form, "angle"), avoid: value(form, "avoid"), urls: lines(form, "urls") });
const message = (error: unknown) => error instanceof z.ZodError ? error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ").slice(0, 2000) : error instanceof Error ? error.message : "Không thực hiện được thao tác";
export async function createAutomation(_state: FormState, form: FormData): Promise<FormState> {
  let id: string;
  try { id = await createVideo(brief(form)); } catch (error) { return { error: message(error) }; }
  redirect(`/automation/${id}`);
}
export async function updateAutomationProfile(_state: FormState, form: FormData): Promise<FormState> {
  try {
    await saveProfile(ProfileSchema.parse({ version: 1, language: value(form, "language"), audience: value(form, "audience"), tone: value(form, "tone"), avoid: value(form, "avoid"), model: value(form, "model"), voice: value(form, "voice"), allowedHosts: lines(form, "allowedHosts"), currency: value(form, "currency"), runLimit: Number(value(form, "runLimit")), videoLimit: Number(value(form, "videoLimit")), monthlyLimit: Number(value(form, "monthlyLimit")), accessConfirmed: form.get("accessConfirmed") === "on", licensesConfirmed: form.get("licensesConfirmed") === "on" }), z.coerce.number().int().nonnegative().parse(value(form, "version")));
    revalidatePath("/automation");
    return {};
  } catch (error) { return { error: message(error) }; }
}
export async function automationCommand(_state: FormState, form: FormData): Promise<FormState> {
  try {
    const expected = head(form);
    const command = value(form, "command");
    if (command === "start") {
      if (form.get("consent") !== "on") throw new Error("Cần xác nhận chi phí chưa biết cho đúng lượt chạy này");
      await startStage(expected, z.enum(RUN_STAGES).parse(value(form, "stage")), { maxCalls: z.coerce.number().int().min(1).max(130).parse(value(form, "maxCalls")), unknownCostAcknowledged: true }, value(form, "durationException"), { title: value(form, "metadataTitle"), description: value(form, "metadataDescription"), thumbnailTitle: value(form, "thumbnailTitle") });
    } else if (command === "approve") {
      if (form.get("reviewed") !== "on") throw new Error("Cần xác nhận đã xem và kiểm tra nội dung hiện hành");
      await approve(expected, Number(value(form, "gate")), value(form, "note"));
    } else if (command === "editCue" || command === "previewScene") {
      await editStoryboard(expected, { sceneId: value(form, "sceneId"), cueId: value(form, "cueId"), text: value(form, "text"), spokenText: value(form, "spokenText"), preview: command === "previewScene" });
    } else if (command === "revise") await revise(expected, form.get("changeBrief") === "on" ? brief(form) : null, value(form, "note"));
    else if (command === "applyProfile") {
      if (form.get("confirmed") !== "on") throw new Error("Cần xác nhận làm cũ toàn bộ nội dung và duyệt lại");
      await applyProfile(expected);
    } else if (command === "reconcile") {
      if (form.get("confirmed") !== "on") throw new Error("Cần xác nhận đã kiểm tra upstream và worker cũ đã dừng; không có tự gửi lại request");
      await reconcileOperation(expected, value(form, "runId"), value(form, "operationKey"), value(form, "note"));
    } else if (command === "archive") await archive(expected);
    else if (command === "work") await addWork(expected, Number(value(form, "minutes")), value(form, "note"));
    else throw new Error("Thao tác không hợp lệ");
    revalidatePath(`/automation/${expected.videoId}`);
    revalidatePath("/automation");
    return {};
  } catch (error) { return { error: message(error) }; }
}
