"use client";

import { useState } from "react";
import type { WorkflowSummary } from "@/lib/comfy/contracts";

export type BackendOptions = { workflows: WorkflowSummary[]; unavailable?: string };
export function ImageBackendPicker({ workflows = [], unavailable }: Partial<BackendOptions>) {
  const [backend, setBackend] = useState("9router");
  const [index, setIndex] = useState(0);
  const release = workflows[index];
  const enabled = workflows.length > 0 && !unavailable;
  return <div className="flex flex-col gap-2 text-xs">
    <label>Backend ảnh
      <select value={backend} onChange={(event) => setBackend(event.target.value)} className="ml-2 rounded border bg-background p-1">
        <option value="9router">9router</option>
        <option value="comfyui" disabled={!enabled}>ComfyUI</option>
      </select>
    </label>
    <input type="hidden" name="backend" value={backend} />
    {!enabled && <p className="text-muted-foreground">{unavailable || "Chưa có workflow phát hành"}</p>}
    {backend === "comfyui" && release && <>
      <label>Workflow <select value={index} onChange={(event) => setIndex(Number(event.target.value))} className="max-w-full rounded border bg-background p-1">
        {workflows.map((item, i) => <option key={`${item.ref.id}:${item.ref.revision}`} value={i}>{item.label}</option>)}
      </select></label>
      <input type="hidden" name="workflowId" value={release.ref.id} />
      <input type="hidden" name="workflowRevision" value={release.ref.revision} />
      <input type="hidden" name="workflowHash" value={release.ref.sha256} />
      <p className="text-muted-foreground">Model/kích thước theo release và preset asset; không tự chuyển model hoặc backend.</p>
      <label className="flex gap-2"><input type="checkbox" name="allowCompute" value="yes" required />Cho phép chạy một lượt sinh ảnh bằng GPU</label>
    </>}
  </div>;
}
