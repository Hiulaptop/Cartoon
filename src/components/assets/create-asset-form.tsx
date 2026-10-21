"use client";

import { useActionState } from "react";

import { createAsset } from "@/app/series/asset-actions";
import type { FormState } from "@/lib/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASSET_KINDS, KIND_LABELS } from "@/lib/assets/naming";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function CreateAssetForm({ seriesId }: { seriesId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAsset, {});

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="seriesId" value={seriesId} />
      <label className="flex flex-col gap-1 text-sm">
        Loại
        <select name="kind" defaultValue="chr" className={fieldClass}>
          {ASSET_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]} ({kind})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mô tả ngắn
        <textarea
          name="brief"
          required
          rows={3}
          placeholder="Vd: nam sinh 15 tuổi, tóc đen dựng, áo hoodie cam, hay pha trò"
          className={fieldClass}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tên hiển thị (tùy chọn)
        <Input name="displayName" placeholder="Vd: Minh" />
      </label>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Đang gửi..." : "Tạo asset"}
      </Button>
    </form>
  );
}
