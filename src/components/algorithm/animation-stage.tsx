"use client";

import { approveStage, beginAnimation } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { ModelPicker } from "@/components/algorithm/model-picker";
import { AnimationPreview, type AnimationPlayback } from "@/components/algorithm/animation-preview";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { AlgorithmAnimationSchema, isAnimationV2, type AlgorithmAnimation } from "@/lib/algorithm/animation/schema";
import type { AnimationOp } from "@/lib/algorithm/animation/schema";

function describeOp(op: AnimationOp): string {
  switch (op.op) {
    case "pointer.show": return `hiện ${op.name}@${op.index}`;
    case "pointer.move": return `${op.name} → ${op.index}`;
    case "pointer.hide": return `ẩn ${op.name}`;
    case "cell.mark": return `đánh dấu [${op.indices.join(",")}] ${op.state}`;
    case "cell.set": return `đặt [${op.index}] = ${op.value}`;
    case "cell.swap": return `đổi chỗ ${op.i} ↔ ${op.j}`;
    case "range.highlight": return `tô ${op.from}–${op.to} ${op.state}`;
    case "note": return `ghi chú "${op.text}"`;
    case "clear": return `xoá ${op.target}`;
  }
}

export function AnimationStage({ videoId, concurrencyVersion, acceptedVoiceId, activeRevision, runError, playback }: {
  playback?: AnimationPlayback;
  videoId: string;
  concurrencyVersion: number;
  acceptedVoiceId: string | null;
  activeRevision?: { id: string; status: string; inputFingerprint: string; content: unknown };
  runError?: string;
}) {
  const [beginState, beginAction, beginning] = useActionFeedback(beginAnimation, { success: "Đã gửi yêu cầu sinh animation", description: "Worker đang xử lý, xem thanh tiến trình phía trên" });
  const [approveState, approveAction, approving] = useActionFeedback(approveStage, { success: "Đã duyệt animation" });
  const parsedAnimation = AlgorithmAnimationSchema.safeParse(activeRevision?.content);
  const animation: AlgorithmAnimation | undefined = parsedAnimation.success ? parsedAnimation.data : undefined;
  const canGenerate = Boolean(acceptedVoiceId) && (!activeRevision || ["failed", "rejected", "stale", "approved"].includes(activeRevision.status));

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <p className="text-muted-foreground">LLM chỉ tạo JSON declarative; thời lượng từng cảnh lấy từ audio đã duyệt; worker render bằng composition Remotion cố định.</p>
      {!acceptedVoiceId ? (
        <p className="text-muted-foreground">Duyệt voice trước khi sinh animation.</p>
      ) : (
        <>
          {canGenerate && (
            <form action={beginAction} className="flex flex-col gap-2">
              <input type="hidden" name="videoId" value={videoId} />
              <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
              <ModelPicker scope="animation" />
              <ActionButton size="sm" pending={beginning} className="self-start">Đưa yêu cầu animation vào worker</ActionButton>
              {beginState.error && <p className="text-xs text-destructive">{beginState.error}</p>}
            </form>
          )}
          {runError && <p className="text-xs text-destructive">Lỗi job animation: {runError}</p>}
          {activeRevision?.status === "generating" && <p>Đang chờ worker sinh animation…</p>}
          {animation && activeRevision && activeRevision.status !== "generating" && (
            <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
              <p className="font-medium">Animation · {activeRevision.status} · {animation.width}×{animation.height} · {animation.fps} fps · {(animation.durationFrames ?? 0) / 30}s</p>
              <AnimationPreview value={animation} playback={playback} />
              {isAnimationV2(animation)
                ? animation.scenes.map((scene) => (
                  <article key={scene.id} className="rounded-md border bg-background p-3">
                    <h3 className="font-semibold">{scene.title || scene.id} · frame {scene.from}–{scene.from + scene.durationFrames}</h3>
                    {scene.array && <p className="mt-2">Mảng: {scene.array.values.join(", ")}</p>}
                    {scene.steps.length === 0 && <p className="mt-1 text-xs text-muted-foreground">Không có bước chuyển động.</p>}
                    {scene.steps.map((step, index) => (
                      <p key={index} className="mt-1 text-xs"><span className="text-muted-foreground">{step.cueId}</span> · {step.ops.map(describeOp).join("; ")}</p>
                    ))}
                    {scene.code && <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 font-mono">{scene.code}</pre>}
                  </article>
                ))
                : animation.scenes.map((scene) => (
                  <article key={scene.id} className="rounded-md border bg-background p-3">
                    <h3 className="font-semibold">{scene.title || scene.id} · frame {scene.from}–{scene.from + scene.durationFrames}</h3>
                    {scene.values.length > 0 && <p className="mt-2">Dữ liệu: {scene.values.map((value, index) => (index === scene.highlightIndex ? <strong key={index}>[{value}] </strong> : <span key={index}>{value} </span>))}</p>}
                    {scene.code && <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono">{scene.code}</pre>}
                    {scene.narration.map((line, index) => <p key={`n-${index}`} className="mt-2">Lời thoại: {line}</p>)}
                    {scene.subtitles.map((line, index) => <p key={`s-${index}`} className="mt-1 text-muted-foreground">Phụ đề: {line}</p>)}
                  </article>
                ))}
              {activeRevision.status === "pending_review" && (
                <form action={approveAction}>
                  <input type="hidden" name="videoId" value={videoId} />
                  <input type="hidden" name="revisionId" value={activeRevision.id} />
                  <input type="hidden" name="stage" value="animation" />
                  <input type="hidden" name="expectedFingerprint" value={activeRevision.inputFingerprint} />
                  <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
                  <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…">Duyệt animation</ActionButton>
                  {approveState.error && <p className="mt-2 text-xs text-destructive">{approveState.error}</p>}
                </form>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
