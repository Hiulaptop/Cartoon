"use client";

import { saveProblem } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { useActionFeedback } from "@/hooks/use-action-feedback";

export function ProblemEditor({ videoId, concurrencyVersion, value = "" }: { videoId: string; concurrencyVersion: number; value?: string }) {
  const [state, action, pending] = useActionFeedback(saveProblem, { success: "Đã lưu revision đề bài" });
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
      <label className="flex flex-col gap-1">
        Đề bài <span className="text-xs text-muted-foreground">Tối đa 100.000 ký tự</span>
        <textarea name="problem" maxLength={100000} rows={10} defaultValue={value} className="w-full rounded-lg border border-input bg-transparent p-3 text-sm" />
      </label>
      <ActionButton size="sm" pending={pending} pendingLabel="Đang lưu…" className="self-start">Lưu revision đề bài</ActionButton>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
