import { notFound, redirect } from "next/navigation";

import { deriveStepStates, pickCurrentStep } from "@/lib/algorithm/steps";
import { loadWorkflow } from "@/lib/algorithm/workflow-cache";

export const dynamic = "force-dynamic";

export default async function AlgorithmIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadWorkflow(id);
  if (!data) notFound();
  redirect(`/designs/${id}/algorithm/${pickCurrentStep(deriveStepStates(data))}`);
}
