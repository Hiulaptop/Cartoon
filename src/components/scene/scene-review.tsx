"use client";

import { useActionState } from "react";

import type { FormState } from "@/app/assets/actions";
import { approveScene, rejectScene } from "@/app/scenes/storyboard-actions";
import { Button } from "@/components/ui/button";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function SceneReview({ sceneId, status }: { sceneId: string; status: string }) {
  const [approveState, approve, approving] = useActionState<FormState, FormData>(approveScene, {});
  const [rejectState, reject, rejecting] = useActionState<FormState, FormData>(rejectScene, {});
  if (status !== "pending_review" && status !== "failed") return null;

  return (
    <div className="flex flex-col gap-3">
      {status === "pending_review" && (
        <form action={approve}>
          <input type="hidden" name="sceneId" value={sceneId} />
          <Button type="submit" size="sm" disabled={approving}>
            Duyệt cảnh
          </Button>
          {approveState.error && <p className="mt-1 text-xs text-destructive">{approveState.error}</p>}
        </form>
      )}
      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="sceneId" value={sceneId} />
        {status === "pending_review" && <textarea name="reason" rows={2} placeholder="Lý do loại (bắt buộc, đưa vào lần viết lại)" className={fieldClass} />}
        <Button type="submit" size="sm" variant="outline" disabled={rejecting} className="self-start">
          {status === "failed" ? "Sinh lại cảnh này" : "Loại và viết lại"}
        </Button>
        {rejectState.error && <p className="text-xs text-destructive">{rejectState.error}</p>}
      </form>
    </div>
  );
}
