"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Bước 3 (phân cảnh) và 4 (xem cảnh) nằm chung một trang, nên gộp thành một tab.
const TABS = [
  { suffix: "", label: "Kịch bản" },
  { suffix: "/storyboard", label: "Phân cảnh và cảnh" },
  { suffix: "/render", label: "Ghép video" },
  { suffix: "/upload", label: "Upload" },
];

export function DesignTabs({ designId }: { designId: string }) {
  const pathname = usePathname();
  const base = `/designs/${designId}`;
  return (
    <nav className="flex flex-wrap gap-1 border-b">
      {TABS.map((tab) => {
        const href = base + tab.suffix;
        const active = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm hover:text-foreground",
              active ? "border-foreground font-medium" : "border-transparent text-muted-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
