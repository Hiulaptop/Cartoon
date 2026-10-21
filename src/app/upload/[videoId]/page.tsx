import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { SuggestButton, UploadForm, type Suggestion } from "@/components/upload/upload-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { jobRuns, renders, uploads, videos } from "@/lib/db/schema";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const STATUS_LABEL: Record<string, string> = { queued: "Đang chờ", running: "Đang upload…", succeeded: "Đã upload", failed: "Lỗi" };
const PRIVACY_LABEL: Record<string, string> = { private: "riêng tư", unlisted: "không công khai", public: "công khai" };

export default async function UploadVideoPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await params;
  if (!UUID_RE.test(videoId)) notFound();
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) notFound();

  const [render] = await db.select().from(renders).where(and(eq(renders.videoId, videoId), eq(renders.status, "approved"))).limit(1);
  const history = await db.select().from(uploads).where(eq(uploads.videoId, videoId)).orderBy(desc(uploads.createdAt));
  const [suggestJob] = await db
    .select()
    .from(jobRuns)
    .where(and(eq(jobRuns.jobType, "upload.suggest_metadata"), eq(jobRuns.targetId, videoId)))
    .orderBy(desc(jobRuns.createdAt))
    .limit(1);
  const suggestion = suggestJob?.status === "succeeded" ? ((suggestJob.metrics as { suggestion?: Suggestion }).suggestion ?? undefined) : undefined;
  const busy = history.some((u) => u.status === "queued" || u.status === "running") || suggestJob?.status === "queued" || suggestJob?.status === "running";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <AutoRefresh active={busy} />
      <div>
        <Link href="/upload" className="text-sm text-muted-foreground hover:underline">
          ← Upload
        </Link>
        <h1 className="text-2xl font-semibold">{video.title}</h1>
      </div>

      {render?.filePath && <video controls preload="metadata" src={`/api/files/${render.filePath}`} className="w-full rounded-lg bg-black" />}

      {video.status === "uploading" && (
        <Card>
          <CardHeader>
            <CardTitle>Thông tin đăng</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <SuggestButton videoId={videoId} />
            {suggestJob?.status === "failed" && <p className="text-sm text-destructive">Gợi ý lỗi: {suggestJob.error}</p>}
            <UploadForm videoId={videoId} suggestion={suggestion} />
          </CardContent>
        </Card>
      )}

      {history.map((u) => (
        <Card key={u.id}>
          <CardHeader>
            <CardTitle>
              {STATUS_LABEL[u.status]} · {PRIVACY_LABEL[u.privacyStatus]} · {timeAgo(u.createdAt)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <p className="text-muted-foreground">Lần thử: {u.attempts}</p>
            {u.error && <p className="break-words text-destructive">{u.error}</p>}
            {u.youtubeVideoId && (
              <a href={`https://www.youtube.com/watch?v=${u.youtubeVideoId}`} target="_blank" rel="noreferrer" className="underline">
                Xem trên YouTube
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
