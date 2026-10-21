"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PIPELINE_STEPS } from "@/lib/pipeline/steps";
import { cn } from "@/lib/utils";

const MAIN_LINKS = [
  { href: "/", label: "Tổng quan" },
  { href: "/jobs", label: "Jobs" },
];

const linkClass = "rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function AppSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground">
      <Link href="/" className="px-2 text-lg font-semibold">
        Cartoon
      </Link>

      <nav className="flex flex-col gap-1">
        {MAIN_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(linkClass, isActive(link.href) && "bg-sidebar-accent font-medium")}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-1">
        <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Quy trình</p>
        {PIPELINE_STEPS.map((step) =>
          step.href ? (
            <Link
              key={step.number}
              href={step.href}
              className={cn(linkClass, isActive(step.href) && "bg-sidebar-accent font-medium")}
            >
              {step.number}. {step.title}
            </Link>
          ) : (
            <span
              key={step.number}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground"
              title={step.description}
            >
              <span>
                {step.number}. {step.title}
              </span>
              <span className="text-xs">{step.hidden ? "ẩn" : step.milestone}</span>
            </span>
          ),
        )}
      </div>
    </aside>
  );
}
