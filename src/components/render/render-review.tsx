"use client";

import { useActionState, useState } from "react";

import type { FormState } from "@/lib/form";
import { approveRender, rejectRender, startRender } from "@/app/render/actions";
import { Button } from "@/components/ui/button";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function StartRenderButton({ videoId, voiceover }: { videoId: string; voiceover?: { id: string; version: number; ready: boolean } | null }) {
  const [audioMode, setAudioMode] = useState("");
  const [state, action, pending] = useActionState<FormState, FormData>(startRender, {});
  return (
    <form action={action}>
      <input type="hidden" name="videoId" value={videoId} />
      <select name="audioMode" aria-label="Chế độ audio" className={fieldClass} value={audioMode} required onChange={(e) => setAudioMode(e.target.value)}>
        <option value="">Chọn chế độ audio…</option>
        <option value="silent">Video không lồng tiếng</option>
        <option value="voiceover" disabled={!voiceover?.ready}>Lồng tiếng{voiceover ? ` · phiên bản ${voiceover.version}` : " · chưa có timeline"}</option>
      </select>
      {voiceover && <input type="hidden" name="timelineVersionId" value={voiceover.id} />}
      {voiceover && !voiceover.ready && <p className="text-sm">Timeline chưa duyệt hoặc đã cũ. Kiểm tra ở tab Lồng tiếng.</p>}
      <Button type="submit" disabled={pending || !audioMode}>
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
