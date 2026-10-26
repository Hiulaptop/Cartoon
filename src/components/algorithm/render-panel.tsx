"use client";

import { approveFinalVideo, beginFinalRender, rejectFinalVideo } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { useActionFeedback } from "@/hooks/use-action-feedback";

const textareaClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function RenderPanel({ videoId, concurrencyVersion, acceptedAnimationId, output, outputRunError }: {
  videoId: string;
  concurrencyVersion: number;
  acceptedAnimationId: string | null;
  output?: { id: string; filePath: string | null; durationFrames: number; inputFingerprint: string; status: string; error: string | null };
  outputRunError?: string;
}) {
  const [renderState, renderAction, rendering] = useActionFeedback(beginFinalRender, { success: "Đã gửi yêu cầu render MP4", description: "Worker đang xử lý, xem thanh tiến trình phía trên" });
  const [approveState, approveAction, approving] = useActionFeedback(approveFinalVideo, { success: "Đã duyệt video cuối" });
  const [rejectState, rejectAction, rejecting] = useActionFeedback(rejectFinalVideo, { success: "Đã từ chối video, có thể render lại" });
  const canRender = Boolean(acceptedAnimationId) && (!output || ["failed", "rejected", "stale"].includes(output.status));

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      {!acceptedAnimationId ? (
        <p className="text-muted-foreground">Duyệt animation trước khi render video.</p>
      ) : (
        <>
          {output?.status === "generating" && <p>Worker đang render MP4…</p>}
          {output?.status === "failed" && <p className="text-xs text-destructive">Render lỗi: {output.error || outputRunError}</p>}
          {output?.filePath && ["pending_review", "approved", "rejected"].includes(output.status) && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <p className="font-medium">Video {output.status} · {output.durationFrames / 30}s</p>
              <video controls preload="metadata" className="w-full max-w-sm rounded-lg" src={`/api/files/${output.filePath}`} />
              <a className="text-sm underline" href={`/api/files/${output.filePath}`} download>⬇ Tải MP4</a>
              <p className="text-xs break-all text-muted-foreground">Output {output.id} · fingerprint {output.inputFingerprint}</p>
            </div>
          )}
          {canRender && (
            <form action={renderAction} className="flex flex-col gap-2">
              <input type="hidden" name="videoId" value={videoId} />
              <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
              <ActionButton size="sm" pending={rendering} className="self-start">Đưa render MP4 vào worker</ActionButton>
              {renderState.error && <p className="text-xs text-destructive">{renderState.error}</p>}
            </form>
          )}
          {output?.status === "pending_review" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <form action={approveAction} className="flex flex-col gap-2">
                <input type="hidden" name="videoId" value={videoId} />
                <input type="hidden" name="outputId" value={output.id} />
                <input type="hidden" name="expectedFingerprint" value={output.inputFingerprint} />
                <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…">Duyệt video cuối</ActionButton>
                {approveState.error && <p className="text-xs text-destructive">{approveState.error}</p>}
              </form>
              <form action={rejectAction} className="flex flex-col gap-2">
                <input type="hidden" name="videoId" value={videoId} />
                <input type="hidden" name="outputId" value={output.id} />
                <input type="hidden" name="expectedFingerprint" value={output.inputFingerprint} />
                <textarea name="reason" required minLength={5} rows={2} className={textareaClass} placeholder="Lý do từ chối (ít nhất 5 ký tự)" />
                <ActionButton size="sm" variant="outline" pending={rejecting}>Từ chối và render lại animation</ActionButton>
                {rejectState.error && <p className="text-xs text-destructive">{rejectState.error}</p>}
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
