import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { RenderReview, StartRenderButton } from "@/components/render/render-review";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { timeAgo } from "@/lib/format";
import { getRenders } from "@/lib/render/queries";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  generating: "Đang render…",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã loại",
  failed: "Lỗi",
};

export default async function RenderVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: videoId } = await params;
  if (!UUID_RE.test(videoId)) notFound();
  const data = await getRenders(videoId);
  if (!data) notFound();
  const { video, rows, progress } = data;
  const busy = rows.some((r) => r.status === "generating");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <AutoRefresh active={busy} />
      <div>
      </div>
      {video.status === "rendering" && !busy && <StartRenderButton videoId={videoId} />}
      {video.status !== "rendering" && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Video chưa ở bước render (cần duyệt đủ mọi cảnh ở bước phân cảnh).</p>
      )}

      {rows.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle>
              {STATUS_LABEL[r.status]} · {timeAgo(r.createdAt)}
            </CardTitle>
            <CardDescription>
              {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : ""}
              {r.status === "generating" ? ` ${Math.round((progress.get(r.id) ?? 0) * 100)}%` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            {r.error && <p className="break-words text-destructive">{r.error}</p>}
            {r.filePath && r.status !== "generating" && r.status !== "failed" && (
              <video controls preload="metadata" src={`/api/files/${r.filePath}`} className="w-full rounded-lg bg-black" />
            )}
            {r.status === "pending_review" && <RenderReview renderId={r.id} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
