import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateVideoForm, type SeriesOption } from "@/components/videos/create-video-form";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { listSeries, readySeriesIds } from "@/lib/series/queries";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function NewDesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const [project] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) notFound();

  const [all, ready] = await Promise.all([listSeries(), readySeriesIds()]);
  // Chỉ bộ phim có ít nhất 1 nhân vật và 1 bối cảnh đã duyệt mới chọn được.
  const options: SeriesOption[] = await Promise.all(
    all
      .filter((s) => ready.has(s.id))
      .map(async (s) => {
        const catalog = await loadApprovedCatalog(s.id);
        return {
          id: s.id,
          name: s.name,
          assets: [...catalog.values()].map((a) => ({ name: a.name, displayName: a.displayName, kind: a.kind })),
        };
      }),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {project.name}
        </Link>
        <h1 className="text-2xl font-semibold">Bản thiết kế mới</h1>
        <p className="text-sm text-muted-foreground">Chọn bộ phim, rồi LLM viết kịch bản bằng asset của bộ phim đó.</p>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có bộ phim nào đủ asset (cần ít nhất 1 nhân vật và 1 bối cảnh đã duyệt). Tạo ở{" "}
          <Link href="/series" className="underline">
            Bộ phim
          </Link>
          .
        </p>
      ) : (
        <CreateVideoForm projectId={id} series={options} />
      )}
    </div>
  );
}
