import Link from "next/link";

import { CreateVideoForm } from "@/components/videos/create-video-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { listVideos } from "@/lib/video/queries";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  scripting: "Viết kịch bản",
  storyboarding: "Phân cảnh",
  rendering: "Render",
  uploading: "Upload",
  done: "Xong",
};

export default async function VideosPage() {
  let options: { name: string; displayName: string; kind: "chr" | "bg" | "prop" | "fx" }[] = [];
  let videos: Awaited<ReturnType<typeof listVideos>> = [];
  let loadError: string | null = null;
  try {
    const [catalog, list] = await Promise.all([loadApprovedCatalog(), listVideos()]);
    options = [...catalog.values()].map((a) => ({ name: a.name, displayName: a.displayName, kind: a.kind }));
    videos = list;
  } catch (error) {
    loadError = errorMessage(error);
  }
  const ready = options.some((o) => o.kind === "chr") && options.some((o) => o.kind === "bg");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">2. Kịch bản</h1>
      {loadError && <p className="text-sm break-all text-destructive">Không đọc được dữ liệu: {loadError}</p>}
      <Card>
        <CardHeader>
          <CardTitle>Video mới</CardTitle>
          <CardDescription>LLM viết kịch bản theo combo cố định, kiểm tra máy rồi chờ bạn duyệt.</CardDescription>
        </CardHeader>
        <CardContent>
          {ready ? (
            <CreateVideoForm assets={options} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Cần ít nhất 1 nhân vật và 1 bối cảnh đã duyệt. Tạo ở{" "}
              <Link href="/assets" className="underline">
                bước 1
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-2">
        {videos.map((v) => (
          <Link key={v.id} href={`/videos/${v.id}`} className="rounded-lg border p-3 text-sm hover:bg-muted/50">
            <span className="font-medium">{v.title}</span>
            <span className="ml-2 text-muted-foreground">
              {STATUS_LABEL[v.status]} · {timeAgo(v.createdAt)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
