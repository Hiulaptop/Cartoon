import { CircleCheckIcon, CircleDashedIcon, EyeIcon, HistoryIcon, Loader2Icon, LockIcon, OctagonXIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STATUS_META, TONE_CLASS, type UiStatus } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const ICONS = {
  locked: LockIcon,
  todo: CircleDashedIcon,
  running: Loader2Icon,
  review: EyeIcon,
  done: CircleCheckIcon,
  failed: OctagonXIcon,
  stale: HistoryIcon,
} as const;

export function StatusBadge({ status, className }: { status: UiStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <Badge variant="outline" className={cn("gap-1", TONE_CLASS[meta.tone], className)}>
      <Icon className={cn("size-3", status === "running" && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}
