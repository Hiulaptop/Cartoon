import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { ScriptReview } from "@/components/videos/script-review";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { scriptContentSchema } from "@/lib/script/schema";
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

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await getVideo(id);
  if (!data) notFound();
  const { video, versions } = data;
  const busy = versions.some((v) => v.status === "generating");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <AutoRefresh active={busy} />
      <div>
        <Link href="/videos" className="text-sm text-muted-foreground hover:underline">
          ← Video
        </Link>
        <h1 className="text-2xl font-semibold">{video.title}</h1>
        {video.brief && <p className="text-sm text-muted-foreground">{video.brief}</p>}
      </div>

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

      <p className="text-sm text-muted-foreground">Tiếp theo: Phân cảnh (M5) · Render (M6) · Upload (M7)</p>
    </div>
  );
}
