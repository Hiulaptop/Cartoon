"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Bước 1 (asset) nằm trong Bộ phim; bước 2–7 nằm trong từng bản thiết kế (thuộc Project).
const MAIN_LINKS = [
  { href: "/", label: "Tổng quan" },
  { href: "/series", label: "Bộ phim" },
  { href: "/projects", label: "Project" },
  { href: "/jobs", label: "Jobs" },
];

const TOOL_LINKS = [{ href: "/scenes/playground", label: "Sân thử JSON cảnh" }];

const linkClass = "rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function AppSidebar() {
  const pathname = usePathname();
  // Trang design thuộc khu vực Project.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/projects" && pathname.startsWith("/designs"));

  const renderLinks = (links: { href: string; label: string }[]) =>
    links.map((link) => (
      <Link key={link.href} href={link.href} className={cn(linkClass, isActive(link.href) && "bg-sidebar-accent font-medium")}>
        {link.label}
      </Link>
    ));

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground">
      <Link href="/" className="px-2 text-lg font-semibold">
        Cartoon
      </Link>
      <nav className="flex flex-col gap-1">{renderLinks(MAIN_LINKS)}</nav>
      <div className="flex flex-col gap-1">
        <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Công cụ</p>
        {renderLinks(TOOL_LINKS)}
      </div>
    </aside>
  );
}
