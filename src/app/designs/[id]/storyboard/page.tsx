import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { ScenePlayer } from "@/components/scene/scene-player";
import { SceneReview } from "@/components/scene/scene-review";
import { StoryboardControls } from "@/components/scene/storyboard-controls";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import { getStoryboard } from "@/lib/scene/queries";
import { parseSceneDsl } from "@/lib/scene/schema";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;
const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  generating: "Đang viết…",
  pending_review: "Chờ duyệt",
  approved: "Đã duyệt",
  rejected: "Đã loại",
  failed: "Không đạt sau 2 vòng sửa",
};

type JudgeDetail = { average?: number | null; blocked?: string[]; result?: { feedback?: string } };

export default async function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: videoId } = await params;
  if (!UUID_RE.test(videoId)) notFound();
  const data = await getStoryboard(videoId);
  if (!data) notFound();
  const { video, script, rows, checks, running } = data;
  const catalog = await loadApprovedCatalog(video.seriesId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <AutoRefresh active={running} />
      <div>
        {!script && <p className="text-sm text-muted-foreground">Video chưa có kịch bản đã duyệt. Duyệt ở bước 2 trước.</p>}
        {running && <p className="text-sm text-muted-foreground">Đang phân cảnh (viết, kiểm tra, giám khảo chấm)…</p>}
      </div>

      {script && (
        <StoryboardControls videoId={videoId} hasScenes={rows.length > 0} canApproveAll={rows.some((r) => r.status === "pending_review")} />
      )}

      {rows.map((row) => {
        const parsed = parseSceneDsl(row.dsl);
        const checked = parsed.ok ? checkSceneDsl(parsed.dsl, catalog) : null;
        const list = checks.get(row.id) ?? [];
        const lastJudge = [...list].reverse().find((v) => (v.scores as { stage?: string }).stage === "judge");
        const lastL1 = [...list].reverse().find((v) => (v.scores as { stage?: string }).stage === "layer1");
        const judge = lastJudge ? ((lastJudge.scores as { detail?: JudgeDetail }).detail ?? {}) : null;
        const sameFamily = list.some((v) => (v.scores as { sameFamily?: boolean }).sameFamily);
        const l1Issues = lastL1 && lastL1.verdict === "fail" ? lastL1.feedback : "";
        return (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle>
                Cảnh {row.position} · {STATUS_LABEL[row.status]}
              </CardTitle>
              <CardDescription>
                {row.durationFrames ? `${(row.durationFrames / 30).toFixed(1)}s` : "chưa có JSON"}
                {judge ? ` · giám khảo ${lastJudge!.verdict === "pass" ? "đạt" : "chưa đạt"}, điểm TB ${judge.average?.toFixed(1) ?? "?"}` : ""}
                {judge?.blocked?.length ? ` · chặn cứng: ${judge.blocked.join(", ")}` : ""}
                {sameFamily ? " · giám khảo cùng họ model viết" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                {parsed.ok && checked && checked.issues.length === 0 ? (
                  <ScenePlayer dsl={parsed.dsl} assets={checked.assets} />
                ) : (
                  <p className="text-sm text-muted-foreground">Không có bản xem trước (JSON thiếu hoặc không còn hợp lệ).</p>
                )}
              </div>
              <div className="flex flex-col gap-3 text-sm">
                {judge?.result?.feedback && <p>Nhận xét giám khảo: {judge.result.feedback}</p>}
                {l1Issues && <pre className="text-xs break-words whitespace-pre-wrap text-destructive">{l1Issues}</pre>}
                <SceneReview sceneId={row.id} status={row.status} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
