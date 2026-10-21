import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateAssetForm } from "@/components/assets/create-asset-form";
import { SeriesSettings } from "@/components/series/series-forms";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { KIND_LABELS } from "@/lib/assets/naming";
import { listAssets, listPendingAssetJobs, variantImageUrl } from "@/lib/assets/queries";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { getSeries } from "@/lib/series/queries";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  generating: "Đang sinh",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Bị loại",
  failed: "Lỗi",
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Bước 1 (assets) của một bộ phim.
export default async function SeriesAssetsPage({ params }: { params: Promise<{ seriesId: string }> }) {
  const { seriesId } = await params;
  if (!UUID_RE.test(seriesId)) notFound();
  const current = await getSeries(seriesId);
  if (!current) notFound();
  let data: Awaited<ReturnType<typeof listAssets>> = [];
  let pending: Awaited<ReturnType<typeof listPendingAssetJobs>> = [];
  let loadError: string | null = null;
  try {
    [data, pending] = await Promise.all([listAssets(seriesId), listPendingAssetJobs()]);
  } catch (error) {
    loadError = errorMessage(error);
  }
  const busy = pending.length > 0 || data.some(({ asset, base }) => asset.status === "generating" || base?.status === "generating");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <AutoRefresh active={busy} />
      <div>
        <Link href="/series" className="text-sm text-muted-foreground hover:underline">
          ← Bộ phim
        </Link>
        <h1 className="text-2xl font-semibold">{current.name}</h1>
        <p className="text-sm text-muted-foreground">Bước 1: nhân vật, bối cảnh, đạo cụ, hiệu ứng của bộ phim này.</p>
      </div>
      <SeriesSettings seriesId={seriesId} name={current.name} />

      <Card>
        <CardHeader>
          <CardTitle>Tạo asset mới</CardTitle>
          <CardDescription>
            LLM viết mô tả chi tiết và đề xuất tên theo chuẩn, rồi sinh ảnh gốc để bạn duyệt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateAssetForm seriesId={seriesId} />
        </CardContent>
      </Card>

      {loadError && <p className="text-sm break-all text-destructive">Không đọc được assets: {loadError}</p>}

      {pending.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {pending.length} asset đang được tạo trong toàn hệ thống (LLM và sinh ảnh mất khoảng 15–60 giây)…
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.map(({ asset, base }) => {
          const url = base ? variantImageUrl(base) : null;
          return (
            <Link key={asset.id} href={`/series/${seriesId}/assets/${asset.id}`}>
              <Card className="h-full transition-colors hover:bg-muted/50">
                <div className="flex h-40 items-center justify-center bg-[repeating-conic-gradient(#e5e5e5_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- ảnh động từ DATA_DIR, không qua tối ưu ảnh của Next
                    <img src={url} alt={asset.name} className="max-h-36 max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">Chưa có ảnh</span>
                  )}
                </div>
                <CardHeader>
                  <CardTitle className="font-mono text-sm">{asset.name}</CardTitle>
                  <CardDescription>
                    {asset.displayName} · {KIND_LABELS[asset.kind]} · {STATUS_LABEL[asset.status]} ·{" "}
                    {timeAgo(asset.createdAt)}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
