import Link from "next/link";

import { JobButtons } from "@/components/job-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PIPELINE_STEPS } from "@/lib/pipeline/steps";
import { getSystemStatus, type Check } from "@/lib/system/status";

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
  const status = await getSystemStatus();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tổng quan</h1>

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

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Quy trình 7 bước</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.map((step) => (
            <Card key={step.number} className={step.href ? undefined : "opacity-60"}>
              <CardHeader>
                <CardTitle>
                  {step.href ? (
                    <Link href={step.href} className="hover:underline">
                      {step.number}. {step.title}
                    </Link>
                  ) : (
                    <>
                      {step.number}. {step.title}
                    </>
                  )}
                </CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {step.href ? "Đang dùng được" : step.hidden ? "Tạm ẩn" : `Có từ mốc ${step.milestone}`}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
