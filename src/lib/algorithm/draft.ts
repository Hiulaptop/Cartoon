import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmRevisions, algorithmWorkflows, projects, series, videos } from "@/lib/db/schema";
import { AlgorithmProblemV1Schema } from "@/lib/algorithm/contracts";

export async function createAlgorithmDraft(input: { projectId: string; seriesId: string; title: string; problem: string }): Promise<string> {
  const { projectId, seriesId, title } = input;
  const content = AlgorithmProblemV1Schema.parse({ version: 1, text: input.problem });
  if (!/^[0-9a-f-]{36}$/i.test(projectId) || !/^[0-9a-f-]{36}$/i.test(seriesId)) throw new Error("Project hoặc bộ phim không hợp lệ");
  if (title.length < 3 || title.length > 160) throw new Error("Tiêu đề phải từ 3 đến 160 ký tự");
  const db = getDb();
  return db.transaction(async (tx) => {
    const [[project], [chosenSeries]] = await Promise.all([
      tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).limit(1),
      tx.select({ id: series.id }).from(series).where(eq(series.id, seriesId)).limit(1),
    ]);
    if (!project || !chosenSeries) throw new Error("Project hoặc bộ phim không tồn tại");
    const [video] = await tx.insert(videos).values({ title, brief: "", seriesId, projectId, kind: "algorithm", status: null }).returning({ id: videos.id });
    const inputFingerprint = createHash("sha256").update(JSON.stringify({ seriesId, content })).digest("hex");
    const [revision] = await tx.insert(algorithmRevisions).values({ videoId: video.id, stage: "problem", version: 1, contractVersion: 1, content, source: "human", status: "draft", inputFingerprint }).returning({ id: algorithmRevisions.id });
    await tx.insert(algorithmWorkflows).values({ videoId: video.id, activeProblemId: revision.id });
    return video.id;
  });
}
