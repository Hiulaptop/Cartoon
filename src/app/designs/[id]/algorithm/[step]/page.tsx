import { notFound } from "next/navigation";

import { LockedStep } from "@/components/algorithm/locked-step";
import { StepHeader } from "@/components/algorithm/step-header";
import { AnimationStep } from "@/components/algorithm/steps/animation-step";
import { ComboStep } from "@/components/algorithm/steps/combo-step";
import { ProblemStep } from "@/components/algorithm/steps/problem-step";
import { RenderStep } from "@/components/algorithm/steps/render-step";
import { ScriptStep } from "@/components/algorithm/steps/script-step";
import { SolutionStep } from "@/components/algorithm/steps/solution-step";
import { VoiceStep } from "@/components/algorithm/steps/voice-step";
import { activeRevisionOf, deriveStepStates, isStepKey, pickCurrentStep, type StepKey } from "@/lib/algorithm/steps";
import { loadWorkflow, type AlgorithmData } from "@/lib/algorithm/workflow-cache";

export const dynamic = "force-dynamic";

const JOB_STAGES: Record<StepKey, string[]> = { problem: ["problem"], solution: ["solution"], combo: ["combo"], script: ["script"], voice: ["voice"], animation: ["animation"], render: ["render"] };

function renderStep(key: StepKey, data: AlgorithmData) {
  switch (key) {
    case "problem": return <ProblemStep data={data} />;
    case "solution": return <SolutionStep data={data} />;
    case "combo": return <ComboStep data={data} />;
    case "script": return <ScriptStep data={data} />;
    case "voice": return <VoiceStep data={data} />;
    case "animation": return <AnimationStep data={data} />;
    case "render": return <RenderStep data={data} />;
  }
}

// Model user đã chọn (nằm trong inputSnapshot của run) kèm tên router trả về khi khác nhau; không có lựa chọn thì chỉ tên router trả về.
function modelLabel(data: AlgorithmData, key: StepKey): string | null {
  const revision = activeRevisionOf(data, key);
  if (!revision) return null;
  const run = revision.generationRunId ? data.generationRuns.find((item) => item.id === revision.generationRunId) : undefined;
  const chosen = (run?.inputSnapshot as { model?: unknown } | undefined)?.model;
  const requested = typeof chosen === "string" && chosen ? chosen : null;
  if (requested && revision.model && revision.model !== requested) return `${requested} (router trả về: ${revision.model})`;
  return requested ?? revision.model;
}

export default async function AlgorithmStepPage({ params }: { params: Promise<{ id: string; step: string }> }) {
  const { id, step } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isStepKey(step)) notFound();
  const data = await loadWorkflow(id);
  if (!data) notFound();
  const states = deriveStepStates(data);
  const state = states.find((item) => item.key === step)!;
  const currentKey = pickCurrentStep(states);
  if (state.status === "locked") return <LockedStep reason={state.lockedReason ?? "Chưa đủ điều kiện"} currentHref={`/designs/${id}/algorithm/${currentKey}`} />;
  return (
    <section className="flex flex-col gap-4">
      <StepHeader designId={id} state={state} currentKey={currentKey} jobStages={JOB_STAGES[step]} jobAssets={step === "script"} model={modelLabel(data, step)} />
      {renderStep(step, data)}
    </section>
  );
}
