"use client";

import { Loader2Icon, OctagonXIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useActivity } from "@/components/algorithm/activity-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_JOB_ATTEMPTS } from "@/lib/algorithm/activity-types";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1_000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// stages: stage của algorithm_generation_runs cần theo dõi; assets: theo dõi cả việc sinh ảnh asset.
// showFailure: chỉ hiện job lỗi khi chính bước đang ở trạng thái lỗi (run cũ thất bại không còn liên quan nếu bước đã được duyệt bằng bản khác).
export function JobStatusBar({ stages, assets = false, showFailure = true }: { stages: string[]; assets?: boolean; showFailure?: boolean }) {
  const { activity, offline, skewMs } = useActivity();
  const run = activity?.runs.find((item) => stages.includes(item.stage));
  const assetsRunning = assets && Boolean(activity?.assetRequests.some((request) => request.status === "generating"));
  const running = run?.status === "queued" || run?.status === "running";
  const now = useNow(running);

  if (!activity) return null;

  if (running && run) {
    const since = Date.parse(run.startedAt ?? run.updatedAt);
    const elapsed = now + skewMs - since;
    const label =
      run.status === "queued"
        ? `Đang xếp hàng chờ worker · ${clock(elapsed)}`
        : `Đang chạy · ${clock(elapsed)}${run.attempts > 1 ? ` · thử lại lần ${run.attempts}/${MAX_JOB_ATTEMPTS}` : ""}`;
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
        <div className="flex items-center gap-2">
          <Loader2Icon className="size-4 animate-spin" />
          <span>{label}</span>
          {offline && <WifiOffIcon className="ml-auto size-4" aria-label="Mất kết nối, đang thử lại" />}
        </div>
        <div className="h-1 overflow-hidden rounded bg-info/20">
          <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded bg-info" />
        </div>
      </div>
    );
  }

  if (assetsRunning) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
        <Loader2Icon className="size-4 animate-spin" />
        <span>Worker đang tạo ảnh asset…</span>
      </div>
    );
  }

  if (showFailure && run?.status === "failed") {
    const message = run.error ?? "Job lỗi, chưa có chi tiết";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="alert" tabIndex={0} className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <OctagonXIcon className="size-4 shrink-0" />
            <span className="truncate">Job lỗi: {message}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm break-words">{message}</TooltipContent>
      </Tooltip>
    );
  }

  return offline ? (
    <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <WifiOffIcon className="size-3.5" /> Mất kết nối tới máy chủ, đang thử lại…
    </div>
  ) : null;
}
