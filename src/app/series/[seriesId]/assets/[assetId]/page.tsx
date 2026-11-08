import Link from "next/link";
import { notFound } from "next/navigation";

import { ComfyRunPanel } from "@/components/assets/comfy-run-panel";
import { listAssetComfyRuns } from "@/lib/comfy/runs";
import { listWorkflowReleases } from "@/lib/comfy/registry";
import { getComfyConfig } from "@/lib/comfy/config";
import { RequestVariantForm } from "@/components/assets/request-variant-form";
import { VariantReview } from "@/components/assets/variant-review";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KIND_LABELS, STATES_BY_KIND } from "@/lib/assets/naming";
import { getAsset, variantImageUrl } from "@/lib/assets/queries";
import { generationSizeInfo, parseGenerationSize } from "@/lib/assets/generation-size";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  generating: "Đang sinh…",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị loại (đang sinh lại)",
  failed: "Lỗi",
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function AssetPage({ params }: { params: Promise<{ seriesId: string; assetId: string }> }) {
  const { seriesId, assetId } = await params;
  if (!UUID_RE.test(assetId)) notFound();
  const data = await getAsset(assetId);
  if (!data || data.asset.seriesId !== seriesId) notFound();
  const { asset, variants } = data;
  const size = parseGenerationSize(asset.generationSize);
  const requested = size ? generationSizeInfo(size) : null;
  const runs = await listAssetComfyRuns(assetId);
  const workflows = listWorkflowReleases();
  let unavailable: string | undefined;
  try { if (!getComfyConfig().enabled) unavailable = "ComfyUI đang tắt"; } catch { unavailable = "Cấu hình ComfyUI không hợp lệ"; }
  if (!workflows.length) unavailable = "Chưa có workflow/model được phát hành; ComfyUI chưa dùng được";
  const backendOptions = { workflows, unavailable };
  const busy = runs.some((r) => ["queued", "running"].includes(r.jobStatus)) || variants.some((v) => !runs.some((r) => r.variantId === v.id && ["prepared", "submitting", "submitted", "uncertain"].includes(r.state)) && (v.status === "generating" || v.status === "rejected"));
  const missingStates = STATES_BY_KIND[asset.kind].filter((s) => s !== "base" && !variants.some((v) => v.state === s));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <AutoRefresh active={busy} />
      <div>
        <Link href={`/series/${seriesId}`} className="text-sm text-muted-foreground hover:underline">
          ← Bộ phim
        </Link>
        <h1 className="font-mono text-2xl font-semibold">{asset.name}</h1>
        <p className="text-sm text-muted-foreground">Kích thước yêu cầu: {requested ? `${requested.width}×${requested.height}` : "Mặc định model"} · áp dụng cho mọi biến thể</p>
        <p className="text-sm text-muted-foreground">
          {asset.displayName} · {KIND_LABELS[asset.kind]} · {STATUS_LABEL[asset.status]} · tham chiếu trong kịch bản:{" "}
          <code className="font-mono">@{asset.name}</code>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mô tả</CardTitle>
          <CardDescription>Giữ nguyên cho mọi biến thể để nhân vật ít lệch nhất có thể.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm whitespace-pre-wrap">{asset.description}</CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {variants.map((variant) => {
          const url = variantImageUrl(variant);
          const sourceKnown = variant.status !== "generating" && variant.status !== "failed" && variant.sourceWidth !== null && variant.sourceHeight !== null;
          const mismatch = sourceKnown && requested && (variant.sourceWidth !== requested.width || variant.sourceHeight !== requested.height);
          return (
            <Card key={variant.id}>
              <div className="flex h-64 items-center justify-center bg-[repeating-conic-gradient(#e5e5e5_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                {url && variant.status !== "generating" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- ảnh động từ DATA_DIR, không qua tối ưu ảnh của Next
                  <img src={url} alt={`${asset.name}.${variant.state}`} className="max-h-60 max-w-full object-contain" />
                ) : (
                  <span className="text-xs text-muted-foreground">{STATUS_LABEL[variant.status]}</span>
                )}
              </div>
              <CardHeader>
                <CardTitle className="font-mono text-sm">
                  {asset.name}.{variant.state}
                </CardTitle>
                <CardDescription>
                  {STATUS_LABEL[variant.status]}
                  {variant.width && variant.height ? ` · PNG: ${variant.width}×${variant.height}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs text-muted-foreground">Ảnh model thực trả: {sourceKnown ? `${variant.sourceWidth}×${variant.sourceHeight}` : "Chưa ghi nhận"}</p>
                {mismatch && <p className="mb-3 text-xs text-amber-700 dark:text-amber-400">Model trả {variant.sourceWidth}×{variant.sourceHeight}, khác kích thước yêu cầu {requested.width}×{requested.height}.</p>}
                <VariantReview
                  assetId={asset.id}
                  variantId={variant.id}
                  state={variant.state}
                  status={variant.status}
                  backendOptions={backendOptions}
                  base={
                    variant.state === "base" && asset.status !== "approved"
                      ? { name: asset.name, displayName: asset.displayName, description: asset.description }
                      : undefined
                  }
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <ComfyRunPanel runs={runs} />
      {asset.status === "approved" && (
        <Card>
          <CardHeader>
            <CardTitle>Thêm biến thể</CardTitle>
            <CardDescription>Trạng thái theo chuẩn đặt tên (docs/standards/asset-naming.md).</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestVariantForm assetId={asset.id} states={missingStates} backendOptions={backendOptions} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
