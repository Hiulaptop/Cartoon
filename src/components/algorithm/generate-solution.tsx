"use client";

import { generateSolution } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { ModelPicker } from "@/components/algorithm/model-picker";
import { useActionFeedback } from "@/hooks/use-action-feedback";

export function GenerateSolution({ videoId, concurrencyVersion, running, blocked }: { videoId: string; concurrencyVersion: number; running: boolean; blocked: boolean }) {
  const [state, action, pending] = useActionFeedback(generateSolution, { success: "Đã gửi yêu cầu sinh lời giải", description: "Worker đang xử lý, xem thanh tiến trình phía trên" });
  return <form action={action} className="flex flex-col gap-2">
    <input type="hidden" name="videoId" value={videoId} />
    <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
    <p className="text-xs text-muted-foreground">LLM sẽ tạo lời giải tiếng Việt từ đề đã duyệt. Kết quả chỉ là bản đề xuất, cần bạn duyệt; code không được thực thi. Nếu đang có lời giải chờ duyệt, hãy duyệt hoặc từ chối trước.</p>
    <ModelPicker scope="solution" />
    <ActionButton size="sm" pending={pending} pendingLabel="Đang gửi…" disabled={running || blocked} className="self-start">{running ? "Đang sinh lời giải…" : "LLM đề xuất lời giải"}</ActionButton>
    {state.error && <p className="text-xs text-destructive">{state.error}</p>}
  </form>;
}
