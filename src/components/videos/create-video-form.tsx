"use client";

import { useActionState } from "react";

import type { FormState } from "@/app/assets/actions";
import { createVideo } from "@/app/videos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KIND_LABELS, type AssetKind } from "@/lib/assets/naming";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export type AssetOption = { name: string; displayName: string; kind: AssetKind };

export function CreateVideoForm({ assets }: { assets: AssetOption[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createVideo, {});

  return (
    <form action={action} className="flex flex-col gap-3">
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
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Đang gửi..." : "Tạo video và viết kịch bản"}
      </Button>
    </form>
  );
}
