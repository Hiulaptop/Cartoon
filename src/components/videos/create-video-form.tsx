"use client";

import { useActionState, useState } from "react";

import { createDesign } from "@/app/designs/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KIND_LABELS, type AssetKind } from "@/lib/assets/naming";
import type { FormState } from "@/lib/form";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export type AssetOption = { name: string; displayName: string; kind: AssetKind };
export type SeriesOption = { id: string; name: string; assets: AssetOption[] };

// Checkbox asset của một bộ phim (mặc định tick hết). Dùng chung cho tạo design và viết kịch bản sau.
export function AssetChecklist({ assets }: { assets: AssetOption[] }) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1">Asset được dùng</legend>
      {assets.map((a) => (
        <label key={a.name} className="flex items-center gap-2">
          <input type="checkbox" name="assetNames" value={a.name} defaultChecked />
          <span className="font-mono">{a.name}</span>
          <span className="text-muted-foreground">
            {a.displayName} · {KIND_LABELS[a.kind]}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function CreateVideoForm({ projectId, series }: { projectId: string; series: SeriesOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createDesign, {});
  const [seriesId, setSeriesId] = useState(series[0]?.id ?? "");
  const current = series.find((s) => s.id === seriesId);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="flex flex-col gap-1 text-sm">
        Bộ phim
        <select name="seriesId" value={seriesId} onChange={(e) => setSeriesId(e.target.value)} className={fieldClass}>
          {series.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tiêu đề (nội bộ)
        <Input name="title" required minLength={3} placeholder="Vd: Tập 1 - Bài kiểm tra bất ngờ" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Brief
        <textarea name="brief" rows={3} className={fieldClass} placeholder="Ý tưởng chính (để trống: LLM tự nghĩ)" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Thời lượng mục tiêu (giây)
        <Input name="targetSeconds" type="number" min={30} max={600} defaultValue={90} className="w-32" />
      </label>
      {current && <AssetChecklist key={current.id} assets={current.assets} />}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Đang gửi..." : "Tạo bản thiết kế và viết kịch bản"}
      </Button>
    </form>
  );
}
