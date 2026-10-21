import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { agreementRate, listVideosWithScript } from "@/lib/scene/queries";

export const dynamic = "force-dynamic";

export default async function ScenesPage() {
  let videos: Awaited<ReturnType<typeof listVideosWithScript>> = [];
  let rate = { agree: 0, total: 0 };
  try {
    [videos, rate] = await Promise.all([listVideosWithScript(), agreementRate()]);
  } catch {
    // DB chưa sẵn sàng: vẫn hiện trang với phần tĩnh.
  }
  const withScript = videos.filter((v) => v.status !== "scripting");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">3–4. Phân cảnh và sinh cảnh</h1>
      <p className="text-sm text-muted-foreground">
        Chọn video đã có kịch bản duyệt để sinh phân cảnh: LLM viết JSON cảnh, máy kiểm tra, giám khảo chấm, tối đa 2 vòng sửa; mỗi cảnh xem được bằng Remotion Player.
      </p>

      <div className="flex flex-col gap-2">
        {withScript.length === 0 && <p className="text-sm text-muted-foreground">Chưa có video nào có kịch bản đã duyệt.</p>}
        {withScript.map((v) => (
          <Link key={v.id} href={`/scenes/${v.id}`} className="rounded-lg border p-3 text-sm hover:bg-muted/50">
            <span className="font-medium">{v.title}</span>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Đồng thuận giám khảo – người duyệt</CardTitle>
          <CardDescription>Số cảnh mà kết luận của giám khảo trùng quyết định duyệt/loại của bạn (spec §6).</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          {rate.total === 0 ? "Chưa có cảnh nào được cả hai bên chấm." : `${rate.agree}/${rate.total} (${Math.round((rate.agree / rate.total) * 100)}%)`}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sân thử JSON cảnh</CardTitle>
          <CardDescription>Dán hoặc sửa JSON, kiểm tra theo khuôn v1 và asset đã duyệt, rồi xem cảnh chạy.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/scenes/playground" className="text-sm underline">
            Mở sân thử →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
