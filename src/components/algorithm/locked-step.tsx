import Link from "next/link";
import { LockIcon } from "lucide-react";

export function LockedStep({ reason, currentHref }: { reason: string; currentHref: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <LockIcon className="size-4" /> Bước này chưa mở
      </div>
      <p className="text-muted-foreground">{reason}.</p>
      <Link href={currentHref} className="underline">
        Đến bước cần làm
      </Link>
    </div>
  );
}
