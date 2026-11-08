"use client";

import { useActionState } from "react";
import { abandonComfyImage, inspectComfyImage, resumeComfyImage } from "@/app/series/asset-actions";
import type { ComfyRunView } from "@/lib/comfy/contracts";
import type { FormState } from "@/lib/form";
import { Button } from "@/components/ui/button";

function Run({ run }: { run: ComfyRunView }) {
  const [inspectState, inspect, inspecting] = useActionState<FormState, FormData>(inspectComfyImage, {});
  const [resumeState, resume, resuming] = useActionState<FormState, FormData>(resumeComfyImage, {});
  const [abandonState, abandon, abandoning] = useActionState<FormState, FormData>(abandonComfyImage, {});
  const fields = <><input type="hidden" name="runId" value={run.id} /><input type="hidden" name="expectedUpdatedAt" value={run.updatedAt} /></>;
  const unresolved = ["prepared", "submitting", "submitted", "uncertain"].includes(run.state);
  return <div className="rounded-lg border p-4 text-sm">
    <p className="break-all font-mono">{run.workflow} · {run.state} · job: {run.jobStatus}</p>
    <p className="break-all text-xs text-muted-foreground">{run.model} · {run.size} · run {run.id}</p>
    <p className="break-all text-xs">Prompt ID: {run.promptId || "Chưa xác định"}</p>
    {run.error && <p className="text-destructive">{run.error}</p>}
    {unresolved && run.jobStatus === "failed" && <div className="mt-3 flex flex-col gap-3">
      <form action={inspect}>{fields}<Button size="sm" variant="outline" disabled={inspecting}>Đối soát (chỉ đọc ComfyUI)</Button>{inspectState.error && <p>{inspectState.error}</p>}</form>
      {run.state === "submitted" && <form action={resume}>{fields}<Button size="sm" disabled={resuming}>Tiếp tục theo dõi/tải kết quả — không sinh mới</Button>{resumeState.error && <p>{resumeState.error}</p>}</form>}
      <details><summary>Đánh dấu bỏ lượt sau đối soát thủ công</summary>
        <form action={abandon} className="mt-2 flex flex-col gap-2">{fields}
          <label><input type="checkbox" name="workerStopped" value="yes" required /> Đã dừng worker liên quan</label>
          <label><input type="checkbox" name="upstreamChecked" value="yes" required /> Đã kiểm tra/xử lý upstream, chấp nhận bỏ kết quả</label>
          <textarea name="note" required maxLength={2000} placeholder="Bằng chứng và lý do bỏ lượt" className="rounded border p-2" />
          <Button type="submit" size="sm" variant="outline" disabled={abandoning}>Bỏ lượt — kết quả muộn không được publish</Button>
          {abandonState.error && <p>{abandonState.error}</p>}
        </form>
      </details>
    </div>}
  </div>;
}
export function ComfyRunPanel({ runs }: { runs: ComfyRunView[] }) {
  if (!runs.length) return null;
  return <section className="flex flex-col gap-3"><h2 className="font-semibold">Lượt ComfyUI — provenance & đối soát</h2><p className="text-xs text-muted-foreground">Không tìm thấy history không có nghĩa an toàn để sinh lại. Hash model là attestation của release, không phải kiểm chứng từ runtime.</p>{runs.map((run) => <Run key={run.id} run={run} />)}</section>;
}
