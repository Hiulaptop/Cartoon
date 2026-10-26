"use client";

import { decideRevision, regenerateSolution } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { ModelPicker } from "@/components/algorithm/model-picker";
import { useActionFeedback } from "@/hooks/use-action-feedback";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function RevisionReview({ videoId, revisionId, fingerprint, concurrencyVersion, source }: {
  videoId: string;
  revisionId: string;
  fingerprint: string;
  concurrencyVersion: number;
  source: "human" | "llm";
}) {
  const [approvedState, approve, approving] = useActionFeedback(decideRevision, { success: "Đã duyệt revision" });
  const [rejectedState, reject, rejecting] = useActionFeedback(decideRevision, { success: "Đã từ chối revision" });
  const [retryState, retry, retrying] = useActionFeedback(regenerateSolution, { success: "Đã gửi yêu cầu LLM sửa lại" });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <form action={approve} className="flex flex-col gap-2">
        <input type="hidden" name="videoId" value={videoId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="expectedFingerprint" value={fingerprint} />
        <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
        <input type="hidden" name="decision" value="approved" />
        <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…">Duyệt revision</ActionButton>
        {approvedState.error && <p className="text-xs text-destructive">{approvedState.error}</p>}
      </form>
      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="videoId" value={videoId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="expectedFingerprint" value={fingerprint} />
        <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
        <input type="hidden" name="decision" value="rejected" />
        <textarea name="reason" required minLength={5} rows={2} placeholder="Lý do từ chối (ít nhất 5 ký tự)" className={fieldClass} />
        <ActionButton size="sm" variant="outline" pending={rejecting}>Từ chối</ActionButton>
        {rejectedState.error && <p className="text-xs text-destructive">{rejectedState.error}</p>}
      </form>
      {source === "llm" && <form action={retry} className="flex flex-col gap-2 sm:col-span-2">
        <input type="hidden" name="videoId" value={videoId} />
        <input type="hidden" name="revisionId" value={revisionId} />
        <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
        <textarea name="reason" required minLength={5} rows={2} placeholder="Từ chối kèm lý do và yêu cầu LLM sửa theo góp ý" className={fieldClass} />
        <ModelPicker scope="solution" />
        <ActionButton size="sm" variant="outline" pending={retrying}>Từ chối và yêu cầu LLM sửa</ActionButton>
        {retryState.error && <p className="text-xs text-destructive">{retryState.error}</p>}
      </form>}
    </div>
  );
}
