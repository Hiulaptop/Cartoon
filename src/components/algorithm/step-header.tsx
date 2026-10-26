import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { JobStatusBar } from "@/components/algorithm/job-status-bar";
import { NEXT_ACTION, STEPS, type StepKey, type StepState } from "@/lib/algorithm/steps";

export function StepHeader({ designId, state, currentKey, jobStages, jobAssets, model }: { designId: string; state: StepState; currentKey: StepKey; jobStages: string[]; jobAssets?: boolean; model?: string | null }) {
  const next = STEPS[STEPS.findIndex((step) => step.key === state.key) + 1];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{state.label}</h2>
        <StatusBadge status={state.status} />
        {model && <span className="text-xs text-muted-foreground">Model: {model}</span>}
      </div>
      <JobStatusBar stages={jobStages} assets={jobAssets} showFailure={state.status === "failed"} />
      <p className="text-sm text-muted-foreground">
        {NEXT_ACTION[state.status](state.label)}{" "}
        {state.status === "done" && next && (
          <Link href={`/designs/${designId}/algorithm/${next.key}`} className="underline">
            Đến &quot;{next.label}&quot;
          </Link>
        )}
        {state.key !== currentKey && state.status !== "done" && (
          <Link href={`/designs/${designId}/algorithm/${currentKey}`} className="underline">
            Đến bước cần làm
          </Link>
        )}
      </p>
    </header>
  );
}
