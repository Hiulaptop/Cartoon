"use client";

import { useActionState } from "react";

import { dropProposal, retryCasting } from "@/app/designs/actions";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/form";

// Bỏ một đề xuất (không dùng asset/biến thể này cho tập).
export function DropProposalButton({ proposalId }: { proposalId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(dropProposal, {});
  return (
    <form action={action}>
      <input type="hidden" name="proposalId" value={proposalId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        Bỏ đề xuất
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function RetryCastingButton({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(retryCasting, {});
  return (
    <form action={action}>
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" size="sm" disabled={pending}>
        Đề xuất lại
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
