import { notFound } from "next/navigation";

import { VariantReview } from "@/components/assets/variant-review";
import { AutoRefresh } from "@/components/auto-refresh";
import { DropProposalButton, RetryCastingButton } from "@/components/designs/proposal-actions";
import { ChangeSeriesForm, StartScriptForm } from "@/components/designs/start-script";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KIND_LABELS } from "@/lib/assets/naming";
import { variantImageUrl } from "@/lib/assets/queries";
import { getCasting } from "@/lib/casting/queries";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { listSeries, readySeriesIds } from "@/lib/series/queries";
import { getVideo } from "@/lib/video/queries";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const DECISION_LABEL: Record<string, string> = { open: "Chờ quyết định", approved: "Đã duyệt", dropped: "Đã bỏ" };
const VARIANT_LABEL: Record<string, string> = {
  generating: "Đang sinh…",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị loại (đang sinh lại)",
  failed: "Lỗi",
};

// Pha casting (spec ai-casting): đề xuất asset của AI, duyệt/loại/bỏ, rồi mở bước viết kịch bản.
export default async function CastingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await getVideo(id);
  if (!data) notFound();
  const { video, versions } = data;
  const [casting, catalog] = await Promise.all([getCasting(id), loadApprovedCatalog(video.seriesId)]);
  const { proposals, assetById, variantByKey, job, useAssets } = casting;

  const open = proposals.filter((p) => p.decision === "open");
  const jobRunning = job?.status === "queued" || job?.status === "running";
  const busy =
    jobRunning ||
    open.some((p) => {
      const v = variantByKey.get(`${p.assetId}.${p.state}`);
      return !assetById.has(p.assetId) || v?.status === "generating" || v?.status === "rejected";
    });

  // Mặc định tick: asset AI chọn dùng lại + asset của các đề xuất đã duyệt.
  const approvedNames = proposals
    .filter((p) => p.decision === "approved")
    .map((p) => assetById.get(p.assetId)?.name)
    .filter((n): n is string => Boolean(n));
  const selected = [...new Set([...useAssets, ...approvedNames])];
  const options = [...catalog.values()].map((a) => ({ name: a.name, displayName: a.displayName, kind: a.kind }));
  const canChangeSeries = proposals.length === 0 && versions.length === 0 && !jobRunning;
  const seriesChoices = canChangeSeries
    ? await Promise.all([listSeries(), readySeriesIds()]).then(([all, ready]) =>
        all.filter((s) => ready.has(s.id) || s.id === video.seriesId).map((s) => ({ id: s.id, name: s.name })),
      )
    : [];

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={busy} />
      <div className="text-sm text-muted-foreground">
        {jobRunning && "AI đang đề xuất asset cho tập này…"}
        {!jobRunning && job?.status === "failed" && <span className="text-destructive">Lượt đề xuất lỗi: {job.error}</span>}
        {!jobRunning && proposals.length > 0 && `${proposals.length} đề xuất, còn ${open.length} chờ quyết định.`}
        {!jobRunning && job?.status === "succeeded" && proposals.length === 0 && "AI không đề xuất asset mới: dùng asset có sẵn."}
      </div>
      {!jobRunning && job?.status === "failed" && proposals.length === 0 && <RetryCastingButton videoId={id} />}

      <div className="grid gap-4 md:grid-cols-2">
        {proposals.map((p) => {
          const asset = assetById.get(p.assetId);
          const variant = variantByKey.get(`${p.assetId}.${p.state}`);
          const url = variant ? variantImageUrl(variant) : null;
          const title = asset ? `${asset.name}${p.state === "base" ? "" : `.${p.state}`}` : `(asset mới) ${p.state === "base" ? "ảnh gốc" : p.state}`;
          const waitingBase = p.kind === "variant" && asset?.status !== "approved";
          return (
            <Card key={p.id} className={p.decision === "dropped" ? "opacity-50" : undefined}>
              <div className="flex h-48 items-center justify-center bg-[repeating-conic-gradient(#e5e5e5_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                {url && variant?.status !== "generating" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh động từ DATA_DIR
                  <img src={url} alt={title} className="max-h-44 max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {variant ? VARIANT_LABEL[variant.status] : waitingBase ? "Chờ duyệt ảnh gốc rồi mới sinh" : "Đang sinh…"}
                  </span>
                )}
              </div>
              <CardHeader>
                <CardTitle className="font-mono text-sm">{title}</CardTitle>
                <CardDescription>
                  {p.kind === "asset" ? `Asset mới${asset ? ` · ${KIND_LABELS[asset.kind]}` : ""}` : "Biến thể"} · {DECISION_LABEL[p.decision]}
                  {variant ? ` · ${VARIANT_LABEL[variant.status]}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Lý do AI: </span>
                  {p.reason}
                </p>
                {p.brief && <p className="text-xs text-muted-foreground">Mô tả: {p.brief}</p>}
                {p.decision === "open" && asset && variant && (
                  <VariantReview
                    assetId={asset.id}
                    variantId={variant.id}
                    state={variant.state}
                    status={variant.status}
                    base={
                      variant.state === "base" && asset.status !== "approved"
                        ? { name: asset.name, displayName: asset.displayName, description: asset.description }
                        : undefined
                    }
                  />
                )}
                {p.decision === "open" && <DropProposalButton proposalId={p.id} />}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Viết kịch bản</CardTitle>
          <CardDescription>Mở khi mọi đề xuất đã duyệt hoặc đã bỏ. Có thể tick thêm asset có sẵn của bộ phim.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canChangeSeries && seriesChoices.length > 1 && <ChangeSeriesForm videoId={id} current={video.seriesId} series={seriesChoices} />}
          {versions.length > 0 ? (
            <p className="text-sm text-muted-foreground">Đã có kịch bản: xem ở tab Kịch bản.</p>
          ) : (
            <StartScriptForm
              key={selected.join(",")}
              videoId={id}
              assets={options}
              selected={selected}
              locked={
                jobRunning
                  ? "Đang chờ AI đề xuất asset."
                  : open.length > 0
                    ? `Còn ${open.length} đề xuất chưa duyệt hoặc chưa bỏ.`
                    : undefined
              }
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
