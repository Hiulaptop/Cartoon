import { notFound } from "next/navigation";

import { ActivityProvider } from "@/components/algorithm/activity-provider";
import { HistorySheet } from "@/components/algorithm/history-sheet";
import { RevisionHistory } from "@/components/algorithm/revision-history";
import { AlgorithmStepper } from "@/components/algorithm/stepper";
import { deriveStepStates } from "@/lib/algorithm/steps";
import { loadWorkflow } from "@/lib/algorithm/workflow-cache";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function AlgorithmLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await loadWorkflow(id);
  if (!data) notFound();
  return (
    <ActivityProvider videoId={id}>
      <div className="flex flex-col gap-6 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <AlgorithmStepper designId={id} steps={deriveStepStates(data)} />
          </div>
          <HistorySheet>
            <RevisionHistory data={data} />
          </HistorySheet>
        </div>
        {children}
      </div>
    </ActivityProvider>
  );
}
