import { RefreshButton } from "@/components/refresh-button";
import { Card, CardContent } from "@/components/ui/card";
import type { JobRun } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { listRecentJobs } from "@/lib/queue/jobs";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<JobRun["status"], string> = {
  queued: "text-muted-foreground",
  running: "text-blue-600",
  succeeded: "text-green-600",
  failed: "text-destructive",
};

export default async function JobsPage() {
  let jobs: JobRun[] = [];
  let loadError: string | null = null;
  try {
    jobs = await listRecentJobs(50);
  } catch (error) {
    loadError = errorMessage(error);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <RefreshButton />
      </div>

      {loadError ? (
        <Card>
          <CardContent className="text-sm break-all text-destructive">Không đọc được job_runs: {loadError}</CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">Chưa có job nào.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Tạo lúc</th>
                <th className="px-3 py-2 font-medium">Loại</th>
                <th className="px-3 py-2 font-medium">Trạng thái</th>
                <th className="px-3 py-2 font-medium">Lần thử</th>
                <th className="px-3 py-2 font-medium">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{timeAgo(job.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{job.jobType}</td>
                  <td className={`px-3 py-2 ${STATUS_CLASS[job.status]}`}>{job.status}</td>
                  <td className="px-3 py-2">{job.attempts}</td>
                  <td className="px-3 py-2 font-mono text-xs break-all">
                    {job.error ? (
                      <span className="text-destructive">{job.error}</span>
                    ) : (
                      JSON.stringify(job.metrics)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
