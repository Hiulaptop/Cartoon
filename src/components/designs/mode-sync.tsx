"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { setMode } from "@/app/mode-actions";
import type { Mode } from "@/lib/mode";

// Mở design của loại khác chế độ hiện tại thì kéo cookie về loại của design (spec S4). Chỉ gọi một lần cho mỗi
// cặp (design, loại): nếu trình duyệt từ chối cookie, layout vẫn render lại ModeSync nhưng khóa này chặn vòng lặp.
export function ModeSync({ designId, kind }: { designId: string; kind: Mode }) {
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    const key = `${designId}:${kind}`;
    if (attempted.current === key) return;
    attempted.current = key;
    setMode(kind)
      .then((result) => {
        if (result.error) toast.error(result.error);
      })
      .catch(() => toast.error("Không đồng bộ được chế độ."));
  }, [designId, kind]);

  return null;
}
