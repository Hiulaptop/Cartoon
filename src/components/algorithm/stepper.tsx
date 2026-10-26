"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StepState } from "@/lib/algorithm/steps";
import { cn } from "@/lib/utils";

export function AlgorithmStepper({ designId, steps }: { designId: string; steps: StepState[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Các bước bài giảng">
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {steps.map((step, index) => {
          const href = `/designs/${designId}/algorithm/${step.key}`;
          const active = pathname === href;
          const body = (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">{index + 1}</span>
              <span className="flex flex-col items-start gap-1">
                <span className="text-sm font-medium whitespace-nowrap">{step.label}</span>
                <StatusBadge status={step.status} />
              </span>
            </>
          );
          const base = "flex min-w-36 items-center gap-2 rounded-lg border px-3 py-2";
          return (
            <li key={step.key}>
              {step.status === "locked" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} aria-disabled="true" className={cn(base, "cursor-not-allowed opacity-60")}>
                      {body}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{step.lockedReason}</TooltipContent>
                </Tooltip>
              ) : (
                <Link href={href} aria-current={active ? "step" : undefined} className={cn(base, "hover:bg-muted", active && "border-foreground bg-muted")}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
