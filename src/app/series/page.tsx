import Link from "next/link";

import { CreateSeriesForm } from "@/components/series/series-forms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/errors";
import { listSeries } from "@/lib/series/queries";

export const dynamic = "force-dynamic";

export default async function SeriesListPage() {
  let rows: Awaited<ReturnType<typeof listSeries>> = [];
  let loadError: string | null = null;
  try {
    rows = await listSeries();
  } catch (error) {
    loadError = errorMessage(error);
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Bộ phim</h1>
      <Card>
        <CardHeader>
          <CardTitle>Bộ phim mới</CardTitle>
          <CardDescription>Mỗi bộ phim sở hữu nhân vật, bối cảnh, đạo cụ riêng (bước 1). Bản thiết kế chọn một bộ phim.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateSeriesForm />
        </CardContent>
      </Card>
      {loadError && <p className="text-sm break-all text-destructive">Không đọc được dữ liệu: {loadError}</p>}
      <div className="flex flex-col gap-2">
        {rows.length === 0 && !loadError && <p className="text-sm text-muted-foreground">Chưa có bộ phim nào.</p>}
        {rows.map((s) => (
          <Link key={s.id} href={`/series/${s.id}`} className="rounded-lg border p-3 text-sm hover:bg-muted/50">
            <span className="font-medium">{s.name}</span>
            <span className="ml-2 text-muted-foreground">{s.assetCount} asset</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
