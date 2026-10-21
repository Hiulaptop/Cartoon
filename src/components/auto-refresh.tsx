"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Tải lại dữ liệu trang định kỳ khi còn việc đang chạy (job sinh ảnh...).
export function AutoRefresh({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);
  return null;
}
