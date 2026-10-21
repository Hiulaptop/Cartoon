import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { ChangeSeriesForm, StartScriptForm } from "@/components/designs/start-script";
import { ScriptReview } from "@/components/videos/script-review";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { scriptContentSchema } from "@/lib/script/schema";
import { listSeries, readySeriesIds } from "@/lib/series/queries";
import { getVideo } from "@/lib/video/queries";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  generating: "Đang viết…",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã loại",
  failed: "Lỗi lớp 1",
};

// Bước 2 (kịch bản) của một bản thiết kế. Khung (tiêu đề, tab) nằm ở layout.
export default async function DesignScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await getVideo(id);
  if (!data) notFound();
  const { video, versions } = data;
  const busy = versions.some((v) => v.status === "generating");
  // Chưa có kịch bản: cho chọn asset để viết, và cho đổi bộ phim (spec §3.3 mục 2).
  const start =
    versions.length === 0
      ? await Promise.all([loadApprovedCatalog(video.seriesId), listSeries(), readySeriesIds()]).then(([catalog, all, ready]) => ({
          assets: [...catalog.values()].map((a) => ({ name: a.name, displayName: a.displayName, kind: a.kind })),
          series: all.filter((s) => ready.has(s.id) || s.id === video.seriesId).map((s) => ({ id: s.id, name: s.name })),
        }))
      : null;

  return (
    <div className="flex flex-col gap-6">
      <AutoRefresh active={busy} />
      {video.brief && <p className="text-sm text-muted-foreground">{video.brief}</p>}

      {start && (
        <Card>
          <CardHeader>
            <CardTitle>Viết kịch bản</CardTitle>
            <CardDescription>Chọn asset của bộ phim cho tập này. Đổi bộ phim chỉ làm được trước khi có kịch bản.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ChangeSeriesForm videoId={video.id} current={video.seriesId} series={start.series} />
            <StartScriptForm videoId={video.id} assets={start.assets} />
          </CardContent>
        </Card>
      )}

      {versions.map((v, index) => {
        const content = scriptContentSchema.safeParse(v.content);
        const script = content.success ? content.data.script : undefined;
        const issues = content.success ? content.data.issues : undefined;
        return (
          <Card key={v.id}>
            <CardHeader>
              <CardTitle>
                v{v.version} · {STATUS_LABEL[v.status]}
              </CardTitle>
              <CardDescription>
                {v.model ?? "chưa có model"}
                {content.success && content.data.meta.feedback ? ` · phản hồi: ${content.data.meta.feedback}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 text-sm">
              {script && (
                <>
                  <div>
                    <p className="font-medium">{script.title}</p>
                    <p className="text-muted-foreground">{script.logline}</p>
                  </div>
                  <div className="flex flex-col gap-3">
                    {script.beats.map((b) => (
                      <div key={b.id} className="rounded-lg border p-3">
                        <p className="font-mono text-xs text-muted-foreground">
                          {b.id} · {b.role} · {b.seconds}s · {b.location} · {b.characters.join(", ")}
                          {b.gag ? ` · gag ${b.gag.kind} (setup ${b.gag.setupBeat})` : ""}
                        </p>
                        <p>{b.summary}</p>
                        <ul className="mt-1 list-disc pl-5">
                          {b.lines.map((l, i) => (
                            <li key={i}>
                              <span className="font-mono text-xs">{l.speaker}</span>: {l.text}
                            </li>
                          ))}
                        </ul>
                        {b.actions.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Hành động: {b.actions.join(" / ")}</p>}
                      </div>
                    ))}
                  </div>
                </>
              )}
              {issues && issues.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-destructive">
                  {issues.map((i) => (
                    <li key={i} className="break-words">
                      {i}
                    </li>
                  ))}
                </ul>
              )}
              {index === 0 && <ScriptReview scriptId={v.id} status={v.status} />}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-sm text-muted-foreground">
        Tiếp theo:{" "}
        <Link href={`/designs/${video.id}/storyboard`} className="underline">
          Phân cảnh
        </Link>
      </p>
    </div>
  );
}
