"use client";

import { useActionState, useState } from "react";

import { createAsset } from "@/app/series/asset-actions";
import type { FormState } from "@/lib/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ASSET_KINDS, KIND_LABELS } from "@/lib/assets/naming";
import { ASSET_GENERATION_SIZES } from "@/lib/assets/generation-size";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function CreateAssetForm({ seriesId }: { seriesId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createAsset, {});
  const [generationSize, setGenerationSize] = useState("model_default");

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
        Kích thước yêu cầu
        <select name="generationSize" value={generationSize} onChange={(event) => {
          const selected = event.currentTarget.value;
          setGenerationSize(selected);
          // React Actions reset native form controls after a returned validation error.
          // Keep the select's native reset default aligned with the controlled choice.
          for (const option of event.currentTarget.options) option.defaultSelected = option.value === selected;
        }} disabled={pending} className={fieldClass}>
          <option value="model_default">Mặc định model</option>
          {ASSET_GENERATION_SIZES.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">Gửi kích thước này cho model. Kết quả tùy khả năng model; nhân vật/đạo cụ/hiệu ứng còn được cắt nền sau khi sinh.</span>
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
