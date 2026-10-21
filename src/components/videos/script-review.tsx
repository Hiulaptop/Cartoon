"use client";

import { useActionState } from "react";

import type { FormState } from "@/app/assets/actions";
import { approveScript, regenerateScript, rejectScript } from "@/app/videos/actions";
import { Button } from "@/components/ui/button";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function ScriptReview({ scriptId, status }: { scriptId: string; status: string }) {
  const [approveState, approve, approving] = useActionState<FormState, FormData>(approveScript, {});
  const [rejectState, reject, rejecting] = useActionState<FormState, FormData>(rejectScript, {});
  const [regenState, regen, regenerating] = useActionState<FormState, FormData>(regenerateScript, {});
  if (status !== "pending_review" && status !== "failed") return null;

  return (
    <div className="flex flex-col gap-3">
      {status === "pending_review" && (
        <form action={approve}>
          <input type="hidden" name="scriptId" value={scriptId} />
          <Button type="submit" size="sm" disabled={approving}>
            Duyệt kịch bản
          </Button>
          {approveState.error && <p className="mt-1 text-xs text-destructive">{approveState.error}</p>}
        </form>
      )}
      {status === "failed" && (
        <form action={regen}>
          <input type="hidden" name="scriptId" value={scriptId} />
          <Button type="submit" size="sm" variant="outline" disabled={regenerating}>
            Viết lại
          </Button>
          {regenState.error && <p className="mt-1 text-xs text-destructive">{regenState.error}</p>}
        </form>
      )}
      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="scriptId" value={scriptId} />
        <textarea name="reason" rows={2} placeholder="Lý do loại (bắt buộc, đưa vào lần viết sau)" className={fieldClass} />
        <Button type="submit" size="sm" variant="outline" disabled={rejecting} className="self-start">
          Loại và viết lại
        </Button>
        {rejectState.error && <p className="text-xs text-destructive">{rejectState.error}</p>}
      </form>
    </div>
  );
}
