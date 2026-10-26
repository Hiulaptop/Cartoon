"use client";

import { generateProblem } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { ModelPicker } from "@/components/algorithm/model-picker";
import { useActionFeedback } from "@/hooks/use-action-feedback";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function ProblemChat({ videoId, concurrencyVersion, running }: { videoId: string; concurrencyVersion: number; running: boolean }) {
  const [state, action, pending] = useActionFeedback(generateProblem, { success: "Đã gửi chủ đề cho AI", description: "Worker đang viết truyện và ra đề" });
  return (
    <form action={action} className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
      <label className="flex flex-col gap-1 text-sm">
        Chủ đề truyện
        <textarea name="theme" required minLength={3} maxLength={500} rows={3} className={fieldClass} placeholder="Vd: Chú mèo đi tìm cá trong vườn, mỗi hàng rào có một lượng cá khác nhau" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Dạng thuật toán (tuỳ chọn)
        <input name="topic" maxLength={200} className={fieldClass} placeholder="Vd: tìm kiếm nhị phân, hai con trỏ. Để trống: AI tự chọn" />
      </label>
      <ModelPicker scope="problem" />
      <ActionButton size="sm" pending={pending} pendingLabel="Đang gửi…" disabled={running} className="self-start">Viết truyện và ra đề</ActionButton>
      <p className="text-xs text-muted-foreground">AI viết truyện ngắn dẫn dắt rồi mô hình hoá thành bài tập. Bản mới thay bản đang chờ duyệt; nếu đề đã duyệt thì các bước sau phải làm lại.</p>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
