import Link from "next/link";
import { notFound } from "next/navigation";

import { DesignTabs } from "@/components/designs/design-tabs";
import { ModeSync } from "@/components/designs/mode-sync";
import { getMode } from "@/lib/mode-server";
import { ancestors } from "@/lib/project/queries";
import { getSeries } from "@/lib/series/queries";
import { getDesign } from "@/lib/video/queries";
import { VIDEO_KIND_LABELS } from "@/lib/video/kind";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Khung chung của một bản thiết kế: breadcrumb project, tên, bộ phim và các tab bước 2–7.
export default async function DesignLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const video = await getDesign(id);
  if (!video) notFound();
  const mode = await getMode();
  const [trail, series] = await Promise.all([ancestors(video.projectId), getSeries(video.seriesId)]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      {mode !== video.kind && <ModeSync designId={id} kind={video.kind} />}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/projects" className="hover:underline">
            Project
          </Link>
          {trail.map((p) => (
            <span key={p.id}>
              {" › "}
              <Link href={`/projects/${p.id}`} className="hover:underline">
                {p.name}
              </Link>
            </span>
          ))}
        </p>
        <h1 className="text-2xl font-semibold">🎬 {video.title}</h1>
        <p className="text-sm text-muted-foreground">
          Bộ phim:{" "}
          {series ? (
            <Link href={`/series/${series.id}`} className="underline">
              {series.name}
            </Link>
          ) : (
            "?"
          )}
        </p>
      </div>
      {video.kind === "cartoon" ? <DesignTabs designId={id} /> : (
        <p className="text-sm text-muted-foreground">{VIDEO_KIND_LABELS.algorithm} · Pipeline riêng, không dùng Casting hoặc kịch bản hoạt hình.</p>
      )}
      {children}
    </div>
  );
}
