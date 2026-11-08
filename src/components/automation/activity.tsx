"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function AutomationActivity({ id, signature, active }: { id: string; signature: string; active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) try {
        const response = await fetch(`/api/automation/${id}/activity`, { cache: "no-store" });
        if (response.ok && (await response.json()).signature !== signature && !stopped) router.refresh();
      } catch { /* Keep the last server-rendered state on network errors. */ }
      if (!stopped) timer = setTimeout(poll, active ? 2500 : 10000);
    };
    timer = setTimeout(poll, active ? 2500 : 10000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [id, signature, active, router]);
  return <p className="text-xs text-muted-foreground">{active ? "Đang chạy · tự cập nhật trạng thái" : "Không có job đang chạy"}</p>;
}
