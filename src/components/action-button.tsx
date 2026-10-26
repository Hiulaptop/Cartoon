"use client";

import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = React.ComponentProps<typeof Button> & { pending?: boolean; pendingLabel?: string };

export function ActionButton({ pending = false, pendingLabel = "Đang gửi…", disabled, children, ...props }: Props) {
  return (
    <Button {...props} disabled={disabled || pending} aria-busy={pending}>
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" data-icon="inline-start" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
