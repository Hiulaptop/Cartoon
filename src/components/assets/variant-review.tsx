"use client";

import { useActionState } from "react";

import { approveVariant, rejectVariant, retryVariant } from "@/app/series/asset-actions";
import type { FormState } from "@/lib/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { ImageBackendPicker, type BackendOptions } from "./image-backend-picker";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

type Props = {
  assetId: string;
  variantId: string;
  state: string;
  status: string;
  backendOptions?: BackendOptions;
  // Chỉ có với ảnh gốc: duyệt base = chốt tên, tên hiển thị, mô tả.
  base?: { name: string; displayName: string; description: string };
};

export function VariantReview({ assetId, variantId, state, status, base, backendOptions }: Props) {
  const [approveState, approve, approving] = useActionState<FormState, FormData>(approveVariant, {});
  const [rejectState, reject, rejecting] = useActionState<FormState, FormData>(rejectVariant, {});
  const [retryState, retry, retrying] = useActionState<FormState, FormData>(retryVariant, {});

  if (status === "failed") {
    return (
      <form action={retry} className="flex flex-col gap-2">
        <input type="hidden" name="assetId" value={assetId} />
        <input type="hidden" name="state" value={state} />
        <ImageBackendPicker {...backendOptions} />
        <Button type="submit" variant="outline" size="sm" disabled={retrying}>
          Tạo lượt sinh mới
        </Button>
        {retryState.error && <p className="text-xs text-destructive">{retryState.error}</p>}
      </form>
    );
  }
  if (status !== "pending_review") return null;

  return (
    <div className="flex flex-col gap-3">
      <form action={approve} className="flex flex-col gap-2">
        <input type="hidden" name="variantId" value={variantId} />
        {base && (
          <>
            <label className="flex flex-col gap-1 text-xs">
              Tên (không đổi được sau khi duyệt)
              <Input name="name" defaultValue={base.name} className="font-mono" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Tên hiển thị
              <Input name="displayName" defaultValue={base.displayName} />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Mô tả (LLM dùng để vẽ lại các biến thể)
              <textarea name="description" defaultValue={base.description} rows={5} className={fieldClass} />
            </label>
          </>
        )}
        <Button type="submit" size="sm" disabled={approving}>
          Duyệt
        </Button>
        {approveState.error && <p className="text-xs text-destructive">{approveState.error}</p>}
      </form>

      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="variantId" value={variantId} />
        <ImageBackendPicker {...backendOptions} />
        <textarea name="reason" rows={2} placeholder="Lý do loại (sẽ đưa vào prompt lần sau)" className={fieldClass} />
        <Button type="submit" variant="outline" size="sm" disabled={rejecting}>
          Loại và sinh lại
        </Button>
        {rejectState.error && <p className="text-xs text-destructive">{rejectState.error}</p>}
      </form>
    </div>
  );
}
