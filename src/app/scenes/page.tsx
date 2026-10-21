import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ScenesPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">4. Sinh cảnh</h1>
      <p className="text-sm text-muted-foreground">
        JSON cảnh do bước 3 (M5) sinh ra được dựng hình bằng Remotion và xem trước ngay trên trình duyệt. Cảnh theo từng video sẽ hiện ở đây sau M5.
      </p>
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
