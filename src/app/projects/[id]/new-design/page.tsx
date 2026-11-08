import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateVideoForm, type SeriesOption } from "@/components/videos/create-video-form";
import { getDb } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
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
  const mode = await getMode();

  const [all, ready] = await Promise.all([listSeries(), readySeriesIds()]);
  // Algorithm chọn mọi bộ phim; form và action vẫn giữ cổng asset riêng của cartoon.
  const options: SeriesOption[] = await Promise.all(
    all.map(async (s) => {
        const catalog = await loadApprovedCatalog(s.id);
        return {
          id: s.id,
          name: s.name,
          cartoonReady: ready.has(s.id),
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
        <p className="text-sm text-muted-foreground">Chọn bộ phim làm nguồn asset dùng lại cho bản thiết kế {MODE_LABELS[mode]}.</p>
      </div>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Chưa có bộ phim nào. Tạo ở{" "}
          <Link href="/series" className="underline">
            Bộ phim
          </Link>
          .
        </p>
      ) : (
        <CreateVideoForm projectId={id} series={options} kind={mode} />
      )}
    </div>
  );
}
