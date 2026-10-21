"use client";

import { useActionState } from "react";

import type { FormState } from "@/lib/form";
import { approveRender, rejectRender, startRender } from "@/app/render/actions";
import { Button } from "@/components/ui/button";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function StartRenderButton({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startRender, {});
  return (
    <form action={action}>
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" disabled={pending}>
        Render video
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function RenderReview({ renderId }: { renderId: string }) {
  const [approveState, approve, approving] = useActionState<FormState, FormData>(approveRender, {});
  const [rejectState, reject, rejecting] = useActionState<FormState, FormData>(rejectRender, {});
  return (
    <div className="flex flex-col gap-3">
      <form action={approve}>
        <input type="hidden" name="renderId" value={renderId} />
        <Button type="submit" size="sm" disabled={approving}>
          Duyệt video
        </Button>
        {approveState.error && <p className="mt-1 text-xs text-destructive">{approveState.error}</p>}
      </form>
      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="renderId" value={renderId} />
        <textarea name="reason" rows={2} placeholder="Lý do loại (video sẽ quay về bước phân cảnh)" className={fieldClass} />
        <Button type="submit" size="sm" variant="outline" disabled={rejecting} className="self-start">
          Loại
        </Button>
        {rejectState.error && <p className="text-xs text-destructive">{rejectState.error}</p>}
      </form>
    </div>
  );
}
