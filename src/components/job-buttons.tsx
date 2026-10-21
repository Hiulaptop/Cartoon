"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { pingNineRouter, pingWorker, type EnqueueResult } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function JobButtons() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<EnqueueResult>, label: string) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? `Đã xếp hàng "${label}".` : `Lỗi: ${result.error}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(pingWorker, "Ping worker")}>
          Ping worker
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(pingNineRouter, "Kiểm tra 9router")}>
          Kiểm tra 9router
        </Button>
      </div>
      {message && (
        <p className="text-sm text-muted-foreground">
          {message}{" "}
          <Link href="/jobs" className="underline underline-offset-4">
            Xem trang Jobs
          </Link>
        </p>
      )}
    </div>
  );
}
