"use client";

import { usePathname } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { setMode } from "@/app/mode-actions";
import { MODES, MODE_LABELS, type Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";

// `mode` từ props là nguồn thật (đọc từ cookie ở server). useOptimistic chỉ để tab sáng ngay khi bấm; thất bại
// thì tự trả về giá trị thật. Bấm cả tab đang sáng vẫn gọi action để sửa trường hợp snapshot Back/Forward bị lệch.
export function ModeSwitch({ mode }: { mode: Mode }) {
  const pathname = usePathname();
  const [optimistic, setOptimistic] = useOptimistic(mode);
  const [pending, startTransition] = useTransition();

  const select = (next: Mode) =>
    startTransition(async () => {
      setOptimistic(next);
      try {
        // Ở trang design phải rời đi, nếu không ModeSync sẽ ép chế độ về loại của design.
        const result = await setMode(next, pathname.startsWith("/designs") ? "/" : undefined);
        if (result.error) toast.error(result.error);
      } catch {
        toast.error("Không đổi được chế độ. Thử lại sau.");
      }
    });

  return (
    <div role="tablist" aria-label="Chế độ" aria-busy={pending} className="inline-flex rounded-lg border p-0.5">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={optimistic === m}
          onClick={() => select(m)}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            optimistic === m ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
