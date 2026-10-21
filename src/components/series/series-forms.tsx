"use client";

import { useActionState } from "react";

import { createSeries, deleteSeries, renameSeries } from "@/app/series/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/form";

export function CreateSeriesForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createSeries, {});
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <Input name="name" required minLength={2} placeholder="Tên bộ phim" className="max-w-sm" />
      <Button type="submit" disabled={pending}>
        Tạo bộ phim
      </Button>
      {state.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function SeriesSettings({ seriesId, name }: { seriesId: string; name: string }) {
  const [renameState, rename, renaming] = useActionState<FormState, FormData>(renameSeries, {});
  const [deleteState, remove, deleting] = useActionState<FormState, FormData>(deleteSeries, {});
  return (
    <div className="flex flex-wrap items-start gap-4">
      <form action={rename} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="seriesId" value={seriesId} />
        <Input name="name" defaultValue={name} required minLength={2} className="max-w-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={renaming}>
          Đổi tên
        </Button>
        {renameState.error && <p className="w-full text-xs text-destructive">{renameState.error}</p>}
      </form>
      <form action={remove}>
        <input type="hidden" name="seriesId" value={seriesId} />
        <Button type="submit" size="sm" variant="outline" disabled={deleting}>
          Xóa bộ phim
        </Button>
        {deleteState.error && <p className="mt-1 text-xs text-destructive">{deleteState.error}</p>}
      </form>
    </div>
  );
}
