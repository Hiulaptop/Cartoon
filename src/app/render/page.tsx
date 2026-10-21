import Link from "next/link";

import { errorMessage } from "@/lib/errors";
import { listRenderableVideos } from "@/lib/render/queries";

export const dynamic = "force-dynamic";

export default async function RenderPage() {
  let videos: Awaited<ReturnType<typeof listRenderableVideos>> = [];
  let loadError: string | null = null;
  try {
    videos = await listRenderableVideos();
  } catch (error) {
    loadError = errorMessage(error);
  }
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">6. Ghép video</h1>
      <p className="text-sm text-muted-foreground">Video đã duyệt đủ mọi cảnh được render thành một MP4 để bạn xem và duyệt.</p>
      {loadError && <p className="text-sm break-all text-destructive">Không đọc được dữ liệu: {loadError}</p>}
      <div className="flex flex-col gap-2">
        {videos.length === 0 && <p className="text-sm text-muted-foreground">Chưa có video nào sẵn sàng render.</p>}
        {videos.map((v) => (
          <Link key={v.id} href={`/render/${v.id}`} className="rounded-lg border p-3 text-sm hover:bg-muted/50">
            <span className="font-medium">{v.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
