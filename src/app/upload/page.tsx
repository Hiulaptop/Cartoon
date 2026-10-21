import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { videos } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import { youtubeStatus } from "@/lib/youtube/status";
import { desc, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  let list: (typeof videos.$inferSelect)[] = [];
  let loadError: string | null = null;
  try {
    list = await getDb().select().from(videos).where(inArray(videos.status, ["uploading", "done"])).orderBy(desc(videos.createdAt));
  } catch (error) {
    loadError = errorMessage(error);
  }
  const yt = youtubeStatus();
  const age = yt.tokenAgeDays;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">7. Upload</h1>
      <Card>
        <CardHeader>
          <CardTitle>Kết nối YouTube</CardTitle>
          <CardDescription>Chỉ hiện có/thiếu cấu hình, không hiện giá trị bí mật.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {yt.configured ? <p>Đã cấu hình OAuth.</p> : <p className="text-destructive">Thiếu: {yt.missing.join(", ")}. Xem README (mục Upload YouTube), rồi chạy <code>npm run youtube:auth</code>.</p>}
          {yt.configured && age !== null && (
            <p className={age >= 7 ? "text-destructive" : age >= 6 ? "text-amber-600" : "text-muted-foreground"}>
              Token cấp cách đây {age.toFixed(1)} ngày. Project ở chế độ Testing: token hết hạn sau 7 ngày, chạy lại <code>npm run youtube:auth</code>.
            </p>
          )}
        </CardContent>
      </Card>
      {loadError && <p className="text-sm break-all text-destructive">Không đọc được dữ liệu: {loadError}</p>}
      <div className="flex flex-col gap-2">
        {list.length === 0 && <p className="text-sm text-muted-foreground">Chưa có video nào ở bước upload (cần duyệt bản render ở bước 6).</p>}
        {list.map((v) => (
          <Link key={v.id} href={`/upload/${v.id}`} className="rounded-lg border p-3 text-sm hover:bg-muted/50">
            <span className="font-medium">{v.title}</span>
            <span className="ml-2 text-muted-foreground">{v.status === "done" ? "Đã upload" : "Chờ upload"}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
