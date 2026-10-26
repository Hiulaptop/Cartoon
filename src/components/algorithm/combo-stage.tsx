"use client";

import { approveStage, beginCombo, saveManualCombo } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { ModelPicker } from "@/components/algorithm/model-picker";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { ALGORITHM_COMBO_COMPONENTS, type AlgorithmComboV1 } from "@/lib/algorithm/contracts";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";
const labels: Record<keyof typeof ALGORITHM_COMBO_COMPONENTS, string> = {
  hook: "Mở đầu", objective: "Mục tiêu", framing: "Đặt vấn đề", structure: "Mạch chính", illustration: "Minh họa",
  codePresentation: "Trình bày code", activity: "Tương tác", verification: "Kiểm chứng", ending: "Kết thúc",
};

function Choice({ name, label, values, value }: { name: string; label: string; values: readonly string[]; value?: string }) {
  return <label className="flex flex-col gap-1">{label}<select className={fieldClass} name={name} defaultValue={value ?? ""}>
    <option value="">Không chọn</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}
  </select></label>;
}

export function ComboStage({ videoId, concurrencyVersion, acceptedSolutionId, activeRevision, acceptedComboId }: {
  videoId: string;
  concurrencyVersion: number;
  acceptedSolutionId: string | null;
  activeRevision?: { id: string; status: string; source: "human" | "llm"; inputFingerprint: string; content: unknown };
  acceptedComboId: string | null;
}) {
  const [beginState, beginAction, beginning] = useActionFeedback(beginCombo, { success: "Đã gửi yêu cầu đề xuất combo", description: "Worker đang xử lý, xem thanh tiến trình phía trên" });
  const [saveState, saveAction, saving] = useActionFeedback(saveManualCombo, { success: "Đã lưu combo để duyệt" });
  const [approveState, approveAction, approving] = useActionFeedback(approveStage, { success: "Đã duyệt combo" });
  const content = activeRevision?.content as Partial<AlgorithmComboV1> | undefined;
  const canStart = Boolean(acceptedSolutionId) && (!activeRevision || ["failed", "rejected", "stale", "approved"].includes(activeRevision.status));
  const needsReason = activeRevision?.status === "pending_review";

  return <section className="flex flex-col gap-4 rounded-lg border p-4">
    <p className="text-muted-foreground">Chọn cấu trúc trình bày cho lời giải đã duyệt. LLM chỉ đề xuất; combo cần được bạn duyệt.</p>
    {!acceptedSolutionId ? <p className="text-muted-foreground">Duyệt lời giải trước để mở bước combo.</p> : <>
      {canStart && <form action={beginAction} className="flex flex-col gap-2">
        <input type="hidden" name="videoId" value={videoId} />
        <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
        <ModelPicker scope="combo" />
        <ActionButton size="sm" pending={beginning}>{activeRevision?.status === "approved" ? "Yêu cầu combo mới từ LLM" : "Đề xuất combo bằng LLM"}</ActionButton>
        {beginState.error && <p className="text-xs text-destructive">{beginState.error}</p>}
      </form>}
      {activeRevision?.status === "generating" && <p>Đang chờ worker đề xuất combo…</p>}
      {activeRevision?.status === "failed" && <p className="text-destructive">Job combo lỗi; có thể yêu cầu worker đề xuất lại hoặc chọn tay.</p>}
      {content && activeRevision && activeRevision.status !== "generating" && <div className="rounded-md bg-muted/40 p-3">
        <p className="mb-3 font-medium">Combo v{(content as { version?: number }).version ?? "?"} · {activeRevision.source === "llm" ? "LLM đề xuất" : "chọn tay"} · {activeRevision.status}</p>
        <dl className="grid gap-2 sm:grid-cols-2">
          {Object.entries(labels).map(([key, label]) => {
            const value = content[key as keyof typeof labels];
            return value ? <div key={key}><dt className="font-medium">{label}</dt><dd>{String(value)}</dd></div> : null;
          })}
          <div><dt className="font-medium">Thời lượng mục tiêu</dt><dd>{content.targetSeconds} giây</dd></div>
          {content.objectiveStatement && <div><dt className="font-medium">Mục tiêu quan sát được</dt><dd>{content.objectiveStatement}</dd></div>}
        </dl>
        {content.rationale && <p className="mt-3"><strong>Lý do:</strong> {content.rationale}</p>}
        {content.outline && <ol className="mt-3 list-inside list-decimal">{content.outline.map((part) => <li key={part.id}>{part.purpose} — {part.seconds}s</li>)}</ol>}
        {activeRevision.status === "pending_review" && <form action={approveAction} className="mt-4">
          <input type="hidden" name="videoId" value={videoId} /><input type="hidden" name="revisionId" value={activeRevision.id} />
          <input type="hidden" name="stage" value="combo" /><input type="hidden" name="expectedFingerprint" value={activeRevision.inputFingerprint} />
          <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
          <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…">Duyệt combo này</ActionButton>
          {approveState.error && <p className="mt-2 text-xs text-destructive">{approveState.error}</p>}
        </form>}
      </div>}
      {(!activeRevision || activeRevision.status !== "generating") && <form action={saveAction} className="flex flex-col gap-3 rounded-md border p-3">
        <h3 className="font-medium">{needsReason ? "Từ chối đề xuất và chọn combo thủ công" : "Chọn combo thủ công"}</h3>
        {needsReason && <label className="flex flex-col gap-1">Lý do không dùng đề xuất hiện tại<textarea name="reason" required minLength={5} rows={2} className={fieldClass} /></label>}
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(ALGORITHM_COMBO_COMPONENTS).map(([key, values]) => <Choice key={key} name={key} label={labels[key as keyof typeof labels]} values={values} value={String(content?.[key as keyof typeof labels] ?? "")} />)}
          <label className="flex flex-col gap-1">Thời lượng mục tiêu (giây)<input className={fieldClass} type="number" name="targetSeconds" min={30} max={180} required defaultValue={content?.targetSeconds ?? 60} /></label>
          <label className="flex flex-col gap-1">Mục tiêu học tập<textarea className={fieldClass} name="objectiveStatement" required minLength={1} maxLength={2000} defaultValue={content?.objectiveStatement ?? ""} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2">Lý do chọn combo<textarea className={fieldClass} name="rationale" required minLength={1} maxLength={5000} defaultValue={content?.rationale ?? ""} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2">Dàn ý — mỗi dòng: mã | số giây | mục đích<textarea className={fieldClass} name="outline" required rows={4} defaultValue={content?.outline?.map((part) => `${part.id} | ${part.seconds} | ${part.purpose}`).join("\n") ?? "hook | 8 | Mở đầu bằng câu hỏi\nexplain | 32 | Giải thích insight và truy vết\nrecap | 20 | Tổng kết và nhắc lại mục tiêu"} /></label>
        </div>
        <input type="hidden" name="videoId" value={videoId} /><input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
        <ActionButton size="sm" variant="outline" pending={saving} pendingLabel="Đang lưu…" disabled={!acceptedSolutionId}>Lưu combo để duyệt</ActionButton>
        {saveState.error && <p className="text-xs text-destructive">{saveState.error}</p>}
      </form>}
      {acceptedComboId && <p className="text-xs text-muted-foreground">Combo hiện tại đã duyệt. Khi yêu cầu đề xuất mới hoặc lưu bản chọn tay khác, các bước phía sau sẽ phải duyệt lại.</p>}
    </>}
  </section>;
}
