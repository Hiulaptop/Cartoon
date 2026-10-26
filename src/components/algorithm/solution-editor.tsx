"use client";

import { saveSolution } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { useActionFeedback } from "@/hooks/use-action-feedback";

const fieldClass = "w-full rounded-lg border border-input bg-transparent p-2 text-sm";

export function SolutionEditor({ videoId, concurrencyVersion }: { videoId: string; concurrencyVersion: number }) {
  const [state, action, pending] = useActionFeedback(saveSolution, { success: "Đã gửi lời giải thủ công để duyệt" });
  return <details className="mt-3 rounded border p-3">
    <summary className="cursor-pointer text-sm">Nhập lời giải thủ công (tùy chọn)</summary>
    <form action={action} className="mt-3 grid gap-3 md:grid-cols-2">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
      <label className="flex flex-col gap-1 text-sm md:col-span-2">Dạng lời giải
        <select name="representation" required className={fieldClass}>
          <option value="cpp">C++</option><option value="python">Python</option><option value="pseudocode">Mã giả</option><option value="explanation">Giải thích thuật toán</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">Ý tưởng chính<textarea name="insight" required maxLength={20000} rows={3} className={fieldClass} /></label>
      <label className="flex flex-col gap-1 text-sm">Thuật toán<textarea name="algorithm" required maxLength={40000} rows={3} className={fieldClass} /></label>
      <label className="flex flex-col gap-1 text-sm">Lập luận đúng đắn<textarea name="correctness" required maxLength={40000} rows={3} className={fieldClass} /></label>
      <div className="flex flex-col gap-2 text-sm">
        <label>Độ phức tạp thời gian<input name="timeComplexity" required maxLength={500} className={fieldClass} /></label>
        <label>Bộ nhớ<input name="memoryComplexity" required maxLength={500} className={fieldClass} /></label>
        <label>Giải thích<textarea name="complexityExplanation" maxLength={5000} rows={2} className={fieldClass} /></label>
      </div>
      <label className="flex flex-col gap-1 text-sm md:col-span-2">Code / mã giả<textarea name="code" maxLength={50000} rows={8} className={`${fieldClass} font-mono`} /></label>
      <label className="flex flex-col gap-1 text-sm">Ví dụ truy vết<textarea name="walkthrough" maxLength={20000} rows={3} className={fieldClass} /></label>
      <label className="flex flex-col gap-1 text-sm">Ca biên (mỗi dòng một mục)<textarea name="edgeCases" maxLength={200000} rows={3} className={fieldClass} /></label>
      <label className="flex flex-col gap-1 text-sm">Giả định (mỗi dòng một mục)<textarea name="assumptions" maxLength={200000} rows={3} className={fieldClass} /></label>
      <label className="flex flex-col gap-1 text-sm">Nguồn tham khảo (mỗi dòng một mục)<textarea name="references" maxLength={200000} rows={3} className={fieldClass} /></label>
      <div className="flex flex-col gap-2 md:col-span-2">
        <ActionButton size="sm" pending={pending} pendingLabel="Đang lưu…" className="self-start">Gửi lời giải thủ công để duyệt</ActionButton>
        {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      </div>
    </form>
  </details>;
}
