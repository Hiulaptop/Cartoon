import { requireModel } from "@/lib/ninerouter/client";

// Model cho job: ưu tiên model user chọn lúc gửi request (nằm trong inputSnapshot bất biến), dự phòng biến môi trường.
export function resolveWriterModel(snapshot: unknown): string {
  const chosen = (snapshot as { model?: unknown } | null | undefined)?.model;
  return typeof chosen === "string" && chosen.trim() ? chosen.trim() : requireModel("LLM_WRITER_MODEL");
}

// Giá trị field `model` của form: rỗng nghĩa là dùng mặc định.
export function chosenModel(form: FormData): string | undefined {
  const value = form.get("model");
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
