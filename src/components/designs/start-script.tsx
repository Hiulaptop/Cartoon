"use client";

import { useActionState } from "react";

import { changeDesignSeries, createScript } from "@/app/designs/actions";
import { AssetChecklist, type AssetOption } from "@/components/videos/create-video-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/form";

const fieldClass = "rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

// Design chưa có kịch bản: chọn asset của bộ phim rồi viết kịch bản v1.
export function StartScriptForm({ videoId, assets }: { videoId: string; assets: AssetOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createScript, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="videoId" value={videoId} />
      <label className="flex flex-col gap-1 text-sm">
        Thời lượng mục tiêu (giây)
        <Input name="targetSeconds" type="number" min={30} max={600} defaultValue={90} className="w-32" />
      </label>
      <AssetChecklist assets={assets} />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        Viết kịch bản
      </Button>
    </form>
  );
}

// Chỉ đổi được bộ phim khi design chưa có kịch bản.
export function ChangeSeriesForm({ videoId, current, series }: { videoId: string; current: string; series: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changeDesignSeries, {});
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="videoId" value={videoId} />
      <select name="seriesId" defaultValue={current} className={fieldClass}>
        {series.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Đổi bộ phim
      </Button>
      {state.error && <p className="w-full text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
