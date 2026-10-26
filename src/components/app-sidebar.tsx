"use client";

import { ActivityIcon, FilmIcon, FolderTreeIcon, LayoutDashboardIcon, MicIcon, ShapesIcon, WrenchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

// Bước 1 (asset) nằm trong Bộ phim; bước 2–7 nằm trong từng bản thiết kế (thuộc Project).
const GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Sản xuất",
    links: [
      { href: "/", label: "Tổng quan", icon: LayoutDashboardIcon },
      { href: "/series", label: "Bộ phim", icon: FilmIcon },
      { href: "/projects", label: "Project", icon: FolderTreeIcon },
    ],
  },
  { title: "Hệ thống", links: [{ href: "/jobs", label: "Jobs", icon: ActivityIcon }] },
  {
    title: "Công cụ",
    links: [
      { href: "/scenes/playground", label: "Sân thử JSON cảnh", icon: ShapesIcon },
      { href: "/tools/tts-tester", label: "Thử giọng đọc TTS", icon: MicIcon },
    ],
  },
];

// Nội dung điều hướng dùng chung cho sidebar (từ md trở lên) và menu trượt trên màn hình hẹp.
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  // Trang design thuộc khu vực Project.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/projects" && pathname.startsWith("/designs"));

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-2 text-lg font-semibold">
        <WrenchIcon className="size-5" /> Cartoon
      </Link>
      {GROUPS.map((group) => (
        <nav key={group.title} aria-label={group.title} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</p>
          {group.links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isActive(href) && "bg-sidebar-accent font-medium")}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
      ))}
    </div>
  );
}

export function AppSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-4 text-sidebar-foreground md:block">
      <SidebarNav />
    </aside>
  );
}
