import { readFile } from "node:fs/promises";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { scripts, scenes, videos } from "@/lib/db/schema";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import { parseSceneDsl } from "@/lib/scene/schema";
import { dataPath } from "@/lib/storage";
import { objectHash, sha256 } from "@/lib/audio/fingerprint";
import type { VisualSnapshot } from "@/lib/audio/types";
import type { VideoProps } from "@/remotion/VideoComposition";

export type AudioDb = Pick<Db, "select" | "insert" | "update" | "execute">;
export async function loadRenderInput(videoId: string, db: AudioDb = getDb()) {
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) throw new Error("Không có design");
  const [script] = await db.select().from(scripts).where(and(eq(scripts.videoId, videoId), eq(scripts.status, "approved"))).orderBy(desc(scripts.version)).limit(1);
  if (!script) throw new Error("Chưa có kịch bản đã duyệt");
  const rows = await db.select().from(scenes).where(eq(scenes.scriptId, script.id)).orderBy(asc(scenes.position));
  if (!rows.length || rows.some((s) => s.status !== "approved")) throw new Error("Cần duyệt đủ mọi cảnh");
  const catalog = await loadApprovedCatalog(video.seriesId);
  const props: VideoProps["scenes"] = [];
  const visual: VisualSnapshot = { scriptId: script.id, scriptVersion: script.version, scriptHash: objectHash(script.content), scenes: [], fps: 30, width: 1920, height: 1080 };
  const used = new Set<string>();
  for (const row of rows) {
    const parsed = parseSceneDsl(row.dsl);
    if (!parsed.ok) throw new Error(`Cảnh ${row.position}: ${parsed.issues[0]}`);
    const checked = checkSceneDsl(parsed.dsl, catalog);
    if (checked.issues.length) throw new Error(`Cảnh ${row.position}: ${checked.issues[0]}`);
    props.push({ dsl: parsed.dsl, assets: checked.assets });
    visual.scenes.push({ id: row.id, position: row.position, dslHash: objectHash(parsed.dsl), durationFrames: parsed.dsl.durationFrames });
    Object.values(checked.assets).forEach((a) => used.add(a.path));
  }
  const imageFiles = await Promise.all([...used].sort().map(async (p) => ({ path: p, sha256: sha256(await readFile(dataPath(p))) })));
  return { visual, scenes: props, imageFiles };
}
