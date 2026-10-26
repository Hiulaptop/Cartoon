"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { activitySignature, type DesignActivity } from "@/lib/algorithm/activity-types";

type ActivityContextValue = { activity: DesignActivity | null; offline: boolean; skewMs: number };

const ActivityContext = createContext<ActivityContextValue>({ activity: null, offline: false, skewMs: 0 });
export const useActivity = () => useContext(ActivityContext);

const FAST_MS = 2_000;
const IDLE_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

// Polling thích ứng: nhanh khi có job chạy, chậm khi rảnh, dừng khi tab ẩn. Chỉ gọi router.refresh()
// khi một run/output/asset đổi trạng thái (không làm mới cả trang mỗi vài giây như AutoRefresh).
export function ActivityProvider({ videoId, children }: { videoId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [value, setValue] = useState<ActivityContextValue>({ activity: null, offline: false, skewMs: 0 });
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async () => {
      if (stopped) return;
      let delay = IDLE_MS;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/designs/${videoId}/activity`, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = (await response.json()) as DesignActivity;
          if (stopped) return;
          failures = 0;
          setValue({ activity: data, offline: false, skewMs: Date.parse(data.serverTime) - Date.now() });
          const signature = activitySignature(data);
          if (lastSignature.current !== null && lastSignature.current !== signature) router.refresh();
          lastSignature.current = signature;
          delay = data.active ? FAST_MS : IDLE_MS;
        } catch {
          failures += 1;
          setValue((previous) => ({ ...previous, offline: true }));
          delay = Math.min(FAST_MS * 2 ** failures, MAX_BACKOFF_MS);
        }
      }
      if (!stopped) timer = setTimeout(tick, delay);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [videoId, router]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
