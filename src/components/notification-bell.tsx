"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { ActivityEvent } from "@/lib/algorithm/activity-types";
import { timeAgo } from "@/lib/format";
import { ALGORITHM_STAGE_LABELS } from "@/lib/video/kind";

const STORAGE_KEY = "cartoon.activity.lastSeen";
const POLL_MS = 15_000;

const KIND_TEXT: Record<ActivityEvent["kind"], string> = { running: "đang chạy", ready: "xong, chờ bạn xem", failed: "bị lỗi" };

function readLastSeen(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : Date.now();
  } catch {
    return Date.now();
  }
}

export function NotificationBell() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() => Date.now());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLastSeen(readLastSeen());
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/activity", { cache: "no-store" });
          if (response.ok) {
            const data = (await response.json()) as { events: ActivityEvent[] };
            if (!stopped) setEvents(data.events);
          }
        } catch {
          // Mất kết nối: giữ danh sách cũ, lần sau thử lại.
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const unread = events.filter((event) => event.kind !== "running" && Date.parse(event.at) > lastSeen).length;

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      const now = Date.now();
      setLastSeen(now);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // localStorage bị chặn: chấp nhận không nhớ mốc đã đọc.
      }
    }
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"} className="relative">
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">{unread > 9 ? "9+" : unread}</span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Thông báo</SheetTitle>
          <SheetDescription>Hoạt động job trong 24 giờ gần nhất, ở mọi bài giảng.</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-2 px-4 pb-4 text-sm">
          {events.length === 0 && <li className="text-muted-foreground">Chưa có hoạt động nào.</li>}
          {events.map((event) => (
            <li key={`${event.id}-${event.kind}`}>
              <Link href={`/designs/${event.designId}/algorithm/${event.stage}`} onClick={() => onOpenChange(false)} className="flex flex-col rounded-md border p-3 hover:bg-muted">
                <span className="font-medium">{event.title}</span>
                <span className="text-muted-foreground">
                  {ALGORITHM_STAGE_LABELS[event.stage] ?? event.stage} {KIND_TEXT[event.kind]} · {timeAgo(new Date(event.at))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
