import { notFound } from "next/navigation";

import { getAlgorithmWorkflow } from "@/lib/algorithm/queries";
import { ALGORITHM_STAGE_LABELS } from "@/lib/video/kind";

export const dynamic = "force-dynamic";

export default async function AlgorithmHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getAlgorithmWorkflow(id);
  if (!data) notFound();
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Lịch sử revisions và duyệt</h2>
      {data.revisions.map((revision) => {
        const inputs = data.inputs.filter((input) => input.revisionId === revision.id);
        const decisions = data.decisions.filter((decision) => decision.revisionId === revision.id);
        const text = (revision.content as { text?: unknown })?.text;
        return <article key={revision.id} className="rounded-lg border p-4 text-sm">
          <h3 className="font-medium">{ALGORITHM_STAGE_LABELS[revision.stage]} · v{revision.version} · {revision.status} · {revision.source}</h3>
          <p className="break-all text-xs text-muted-foreground">Revision {revision.id}</p>
          <p className="break-all text-xs text-muted-foreground">Fingerprint {revision.inputFingerprint}</p>
          {typeof text === "string" && <p className="mt-3 whitespace-pre-wrap">{text || "(đề trống)"}</p>}
          {inputs.length > 0 && <p className="mt-2 break-all text-xs">Nguồn revision: {inputs.map((input) => input.inputRevisionId).join(", ")}</p>}
          {decisions.map((decision) => <p key={decision.id} className="mt-2">{decision.decision === "approved" ? "Đã duyệt" : "Đã từ chối"}{decision.reason ? ` · ${decision.reason}` : ""}</p>)}
        </article>;
      })}
    </section>
  );
}
