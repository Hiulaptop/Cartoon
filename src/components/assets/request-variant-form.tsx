"use client";

import { useActionState } from "react";

import { requestVariant, type FormState } from "@/app/assets/actions";
import { Button } from "@/components/ui/button";

export function RequestVariantForm({ assetId, states }: { assetId: string; states: readonly string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestVariant, {});
  if (states.length === 0) return <p className="text-sm text-muted-foreground">Đã có đủ các trạng thái.</p>;

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="assetId" value={assetId} />
      <select name="state" className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm">
        {states.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" disabled={pending}>
        Sinh biến thể
      </Button>
      {state.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}
