"use client";

import Link from "next/link";
import { approveAlgorithmAsset, approveStage, beginScript, resolveAssets } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { ModelPicker } from "@/components/algorithm/model-picker";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import type { AlgorithmScriptV1 } from "@/lib/algorithm/contracts";

export function ScriptStage({ videoId, concurrencyVersion, acceptedComboId, activeRevision, acceptedScriptId, runError, assetRequests, seriesId, catalog }: {
  videoId: string;
  concurrencyVersion: number;
  acceptedComboId: string | null;
  activeRevision?: { id: string; status: string; source: "human" | "llm"; inputFingerprint: string; content: unknown };
  acceptedScriptId: string | null;
  runError?: string;
  assetRequests: { id: string; temporaryKey: string; brief: string; status: string; assetId: string | null; state: string | null; reason: string; error?: string; assetName?: string; variantStatus?: string; imagePath?: string | null }[];
  seriesId: string;
  catalog: { variantId: string; assetId: string; name: string; displayName: string | null; kind: string; state: string; filePath: string | null }[];
}) {
  const [beginState, beginAction, beginning] = useActionFeedback(beginScript, { success: "Đã gửi yêu cầu sinh kịch bản", description: "Worker đang xử lý, xem thanh tiến trình phía trên" });
  const [approveState, approveAction, approving] = useActionFeedback(approveStage, { success: "Đã duyệt kịch bản" });
  const [assetState, assetAction, assetPending] = useActionFeedback(approveAlgorithmAsset, { success: "Đã xử lý yêu cầu asset" });
  const [resolveState, resolveAction, resolving] = useActionFeedback(resolveAssets, { success: "Đã gửi yêu cầu gán asset", description: "Hệ thống đang chọn hoặc tạo asset" });
  const hasOpen = assetRequests.some((request) => request.status === "open" || request.status === "failed");
  const script = activeRevision?.content as Partial<AlgorithmScriptV1> | undefined;
  const usedAssetKeys = [...new Set(script?.scenes?.flatMap((scene) => scene.assetKeys) ?? [])];
  const unresolvedAssets = usedAssetKeys.some((key) => !assetRequests.some((request) => request.temporaryKey === key && request.status === "bound")) || assetRequests.some((request) => request.status !== "bound");
  const canStart = Boolean(acceptedComboId) && (!activeRevision || ["failed", "rejected", "stale", "approved"].includes(activeRevision.status));

  return <section className="flex flex-col gap-4 rounded-lg border p-4">
    <p className="text-muted-foreground">Worker sinh bản nháp từ combo đã duyệt. Đọc lại lời thoại, phụ đề và hình ảnh trước khi duyệt.</p>
    {!acceptedComboId ? <p className="text-muted-foreground">Duyệt combo trước để mở bước kịch bản.</p> : <>
      {canStart && <form action={beginAction} className="flex flex-col gap-2">
        <input type="hidden" name="videoId" value={videoId} /><input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
        <ModelPicker scope="script" />
        <ActionButton size="sm" pending={beginning}>{activeRevision?.status === "approved" ? "Sinh revision kịch bản mới bằng worker" : "Sinh kịch bản bằng worker"}</ActionButton>
        {beginState.error && <p className="text-xs text-destructive">{beginState.error}</p>}
      </form>}
      {activeRevision?.status === "generating" && <p>Đang chờ worker sinh kịch bản…</p>}
      {activeRevision?.status === "failed" && <p className="text-xs text-destructive">Job sinh kịch bản thất bại. Có thể yêu cầu worker thử lại.</p>}
      {runError && <p className="text-xs text-destructive">Lỗi job kịch bản: {runError}</p>}
      {script && activeRevision && activeRevision.status !== "generating" && <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
        <p className="font-medium">Kịch bản v{script.version ?? "?"} · {activeRevision.source === "llm" ? "LLM" : "nhập tay"} · {activeRevision.status} · {script.targetSeconds}s</p>
        {(script.scenes ?? []).map((scene, index) => <article key={scene.id} className="rounded-md border bg-background p-3">
          <h3 className="font-semibold">Cảnh {index + 1}: {scene.purpose} · {scene.seconds}s</h3>
          <p className="mt-2"><strong>Hình ảnh:</strong> {scene.visual}</p>
          {!!scene.dialogue.length && <div className="mt-2"><strong>Lời thoại:</strong><ol className="list-inside list-decimal">{scene.dialogue.map((line, i) => <li key={`${scene.id}-d-${i}`}>{line}</li>)}</ol></div>}
          {!!scene.subtitles.length && <div className="mt-2"><strong>Phụ đề:</strong><ol className="list-inside list-decimal">{scene.subtitles.map((line, i) => <li key={`${scene.id}-s-${i}`}>{line}</li>)}</ol></div>}
          {scene.code && <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono">{scene.code}</pre>}
          {!!scene.assetKeys.length && <p className="mt-2 text-xs text-muted-foreground">Asset keys cần xử lý: {scene.assetKeys.join(", ")}</p>}
        </article>)}
        {activeRevision.status === "pending_review" && <div className="flex flex-col gap-3">
          {unresolvedAssets && <p className="text-sm text-warning">Chờ hệ thống gán asset và bạn duyệt ảnh mới trước khi duyệt kịch bản.</p>}
          <p className="text-sm text-muted-foreground">Hệ thống tự chọn asset từ bộ phim, thiếu thì tạo thêm vào chính bộ phim đó. Bạn chỉ cần duyệt ảnh mới.</p>
          {hasOpen && <form action={resolveAction} className="flex flex-col gap-2">
            <input type="hidden" name="videoId" value={videoId} />
            <ActionButton size="sm" variant="outline" pending={resolving} pendingLabel="Đang gửi…" className="self-start">Gán asset tự động</ActionButton>
            {resolveState.error && <p className="text-xs text-destructive">{resolveState.error}</p>}
          </form>}
          {assetRequests.map((request) => <div key={request.id} className="flex flex-col gap-2 rounded-md border bg-background p-3">
            <div className="flex items-start gap-3">
              {request.imagePath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${request.imagePath}`} alt={request.temporaryKey} className="size-20 shrink-0 rounded border bg-muted object-contain [image-rendering:pixelated]" />
              )}
              <div className="flex flex-col gap-1">
                <h4 className="font-medium">Asset {request.temporaryKey} · {request.status === "bound" ? "đã gắn" : request.status === "generating" ? (request.variantStatus === "pending_review" ? "chờ bạn duyệt ảnh" : request.variantStatus === "failed" ? "tạo ảnh lỗi" : "đang tạo ảnh") : request.status === "open" ? "chưa gán" : request.status}</h4>
                <p className="text-sm">{request.brief}</p>
                {request.assetName && <p className="text-xs text-muted-foreground">{request.assetName}/{request.state}</p>}
              </div>
            </div>
            {request.reason && request.status === "failed" && <p className="text-xs text-destructive">{request.reason}</p>}
            {request.error && request.status === "failed" && <p className="text-xs text-destructive">Job lỗi: {request.error}</p>}
            {(request.status === "generating" || request.status === "pending_review") && request.variantStatus === "pending_review" && request.assetId && <Link className="text-sm underline" href={`/series/${seriesId}/assets/${request.assetId}`}>Mở ảnh để duyệt</Link>}
            {request.status === "generating" && request.variantStatus === "failed" && request.assetId && <Link className="text-sm underline" href={`/series/${seriesId}/assets/${request.assetId}`}>Mở asset để sinh lại ảnh</Link>}
            {(request.status === "open" || request.status === "failed") && <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Gán tay</summary>
              <form action={assetAction} className="mt-2 flex flex-col gap-2">
                <input type="hidden" name="videoId" value={videoId} /><input type="hidden" name="requestId" value={request.id} /><input type="hidden" name="target" value="existing" />
                <label className="flex flex-col gap-1">Dùng asset đã duyệt trong series<select className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm" name="assetName" defaultValue="" required>
                  <option value="">Chọn một biến thể</option>{catalog.map((item) => <option key={item.variantId} value={item.variantId}>{item.displayName || item.name} · {item.kind}/{item.state}</option>)}
                </select></label>
                <ActionButton size="sm" pending={assetPending} pendingLabel="Đang gắn…" disabled={catalog.length === 0}>Gắn asset đã chọn</ActionButton>
                {assetState.error && <p className="text-xs text-destructive">{assetState.error}</p>}
              </form>
            </details>}
          </div>)}
          <form action={approveAction}>
            <input type="hidden" name="videoId" value={videoId} /><input type="hidden" name="revisionId" value={activeRevision.id} />
            <input type="hidden" name="stage" value="script" /><input type="hidden" name="expectedFingerprint" value={activeRevision.inputFingerprint} />
            <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
            <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…" disabled={unresolvedAssets}>Duyệt kịch bản</ActionButton>
            {approveState.error && <p className="mt-2 text-xs text-destructive">{approveState.error}</p>}
          </form>
        </div>}
      </div>}
      {acceptedScriptId && <p className="text-xs text-muted-foreground">Kịch bản hiện tại đã duyệt. Sinh revision mới sẽ làm các bước sau cần được duyệt lại.</p>}
    </>}
  </section>;
}
