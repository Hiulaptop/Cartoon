import Link from "next/link";

import { JobButtons } from "@/components/job-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { algorithmWorkflows, videos } from "@/lib/db/schema";
import { STEPS as ALGORITHM_STEPS } from "@/lib/algorithm/steps";
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
import { PIPELINE_STEPS } from "@/lib/pipeline/steps";
import { agreementRate } from "@/lib/scene/queries";
import { listSeries } from "@/lib/series/queries";
import { getSystemStatus, type Check } from "@/lib/system/status";
import { desc, eq } from "drizzle-orm";
import { ALGORITHM_STAGE_LABELS, VIDEO_KIND_LABELS } from "@/lib/video/kind";

export const dynamic = "force-dynamic";

function StatusRow({ label, check }: { label: string; check: Check }) {
  return (
    <li className="flex items-start justify-between gap-4 text-sm">
      <span>{label}</span>
      <span className={check.ok ? "text-right text-green-600" : "text-right break-all text-destructive"}>
        {check.detail}
      </span>
    </li>
  );
}

export default async function Home() {
  const mode = await getMode();
  const status = await getSystemStatus();
  // Phần dữ liệu không được làm hỏng trang khi DB lỗi (khối Hệ thống đã báo lỗi DB).
  const [seriesList, recent, rate] = await Promise.all([
    listSeries().catch(() => []),
    getDb().select({ id: videos.id, title: videos.title, kind: videos.kind, stage: algorithmWorkflows.stage }).from(videos).leftJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id)).where(eq(videos.kind, mode)).orderBy(desc(videos.createdAt)).limit(5).catch(() => []),
    agreementRate().catch(() => ({ agree: 0, total: 0 })),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tổng quan · {MODE_LABELS[mode]}</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hệ thống</CardTitle>
            <CardDescription>Postgres (Supabase), hàng đợi pgmq, 9router, worker</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              <StatusRow label="Database" check={status.database} />
              <StatusRow label="Hàng đợi" check={status.queue} />
              <StatusRow label="9router" check={status.nineRouter} />
              <StatusRow label="Ping worker gần nhất" check={status.lastPing} />
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kiểm tra nhanh</CardTitle>
            <CardDescription>Đẩy job vào hàng đợi rồi xem kết quả ở trang Jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <JobButtons />
          </CardContent>
        </Card>
      </div>

      <div className={mode === "cartoon" ? "grid gap-4 md:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/series" className="hover:underline">
                Bộ phim
              </Link>
            </CardTitle>
            <CardDescription>{mode === "cartoon" ? "Bước 1: asset của từng bộ phim" : "Asset cho cảnh truyện dẫn của từng bộ phim"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {seriesList.length === 0 && <span className="text-muted-foreground">Chưa có bộ phim.</span>}
            {seriesList.slice(0, 5).map((s) => (
              <Link key={s.id} href={`/series/${s.id}`} className="hover:underline">
                {s.name} <span className="text-muted-foreground">· {s.assetCount} asset</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/projects" className="hover:underline">
                Bản thiết kế gần đây
              </Link>
            </CardTitle>
            <CardDescription>{mode === "cartoon" ? "Bước 2–7 nằm trong từng bản thiết kế" : "Mỗi bản thiết kế có workspace 7 bước riêng"}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            {recent.length === 0 && <span className="text-muted-foreground">Chưa có bản thiết kế.</span>}
            {recent.map((v) => (
              <Link key={v.id} href={`/designs/${v.id}`} className="hover:underline">
                {v.title} <span className="text-muted-foreground">· {VIDEO_KIND_LABELS[v.kind]}{v.kind === "algorithm" ? ` · ${ALGORITHM_STAGE_LABELS[v.stage ?? "problem"]}` : ""}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        {mode === "cartoon" && (
          <Card>
            <CardHeader>
              <CardTitle>Đồng thuận giám khảo – người</CardTitle>
              <CardDescription>Cảnh mà kết luận giám khảo trùng quyết định của bạn (spec §6)</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {rate.total === 0 ? "Chưa có dữ liệu." : `${rate.agree}/${rate.total} (${Math.round((rate.agree / rate.total) * 100)}%)`}
            </CardContent>
          </Card>
        )}
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Quy trình {MODE_LABELS[mode].toLowerCase()} (7 bước)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mode === "cartoon"
            ? PIPELINE_STEPS.map((step) => (
                <Card key={step.number} className={step.hidden ? "opacity-60" : undefined}>
                  <CardHeader>
                    <CardTitle>
                      {step.number}. {step.title}
                    </CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">{step.where}</CardContent>
                </Card>
              ))
            : ALGORITHM_STEPS.map((step, index) => (
                <Card key={step.key}>
                  <CardHeader>
                    <CardTitle>
                      {index + 1}. {step.label}
                    </CardTitle>
                    <CardDescription>
                      {step.requires ? `Cần hoàn tất: ${ALGORITHM_STEPS.find((s) => s.key === step.requires)?.label}` : "Bước đầu tiên"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">Bản thiết kế › Workspace giảng bài</CardContent>
                </Card>
              ))}
        </div>
      </section>
    </div>
  );
}
