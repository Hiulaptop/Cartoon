// Manual content smoke, approved in 2026-10-23-boston-tea-party-smoke.md.
// Start with the real background job; never generate remaining assets until it passes.
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, getPool } from "../../../src/lib/db/client";
import { series, assets, assetVariants, jobRuns } from "../../../src/lib/db/schema";
import { enqueueJob } from "../../../src/lib/queue/jobs";
import { dataPath, writeDataFile } from "../../../src/lib/storage";

const manifestPath = "experiments/remotion-boston/2026-10-23-r1/manifest.json";
type Manifest = {
  runId: string; createdAt: string; seriesId: string; assetId: string;
  jobId?: string; status: string; modelsHttp?: number; job?: unknown;
  background?: { filePath: string; width: number; height: number; sha256: string; ratioPass: boolean; assetStatus: string; variantStatus: string };
};
async function load(): Promise<Manifest | null> {
  try { return JSON.parse(await readFile(dataPath(manifestPath), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
async function save(manifest: Manifest) {
  await writeDataFile(manifestPath, JSON.stringify(manifest, null, 2));
}
async function main() {
  const command = process.argv[2];
  if (command !== "background" && command !== "status") throw new Error("Usage: run.ts background|status");
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Smoke requires the existing local database");
  const db = getDb();
  let manifest = await load();
  if (command === "background") {
    if (manifest) throw new Error("Run already exists; use status. Refusing duplicate generation.");
    const base = process.env.NINE_ROUTER_BASE_URL?.replace(/\/+$/, "");
    const key = process.env.NINE_ROUTER_API_KEY;
    if (!base || !key) throw new Error("Router configuration missing");
    const response = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Router models HTTP ${response.status}`);
    const name = "SMOKE — Puno Boston Tea Party — 2026-10-23";
    await db.insert(series).values({ name }).onConflictDoNothing({ target: series.name });
    const [group] = await db.select().from(series).where(eq(series.name, name));
    if (!group) throw new Error("Smoke series missing");
    manifest = { runId: "2026-10-23-r1", createdAt: new Date().toISOString(), seriesId: group.id, assetId: randomUUID(), status: "preparing", modelsHttp: response.status };
    await save(manifest);
    // Same transactional enqueue and worker handler used by the original app.
    manifest.jobId = await enqueueJob("asset.generate_base", {
      assetId: manifest.assetId, seriesId: group.id, kind: "bg",
      displayName: "Boston harbor — distant background only",
      brief: "bg_boston_harbor_far. A reusable distant background layer for a flat 2D cartoon set at Boston harbor in 1773. Extra wide landscape image, exact 16:9 canvas, preferably 1920x1080. Pale blue sky, sparse soft clouds, low distant colonial Boston shoreline and small distant rooftops; calm distant blue harbor water below a clear level horizon at 40 percent image height. Empty unobstructed foreground for separately composited water, pier, merchant ship, penguin and workers. No people, no penguins, no tea crates, no barrels, no foreground ship, no foreground pier, no portal, no splash. All action and foreground objects will be separate assets. No text or lettering.",
    }, { type: "asset", id: manifest.assetId });
    manifest.status = "background_queued";
    await save(manifest);
  }
  if (!manifest?.jobId) throw new Error("No queued background recorded; inspect manifest before any retry");
  const [job] = await db.select().from(jobRuns).where(eq(jobRuns.id, manifest.jobId));
  if (!job) throw new Error("Job missing");
  manifest.job = { id: job.id, status: job.status, attempts: job.attempts, error: job.error, metrics: job.metrics, startedAt: job.startedAt, finishedAt: job.finishedAt };
  if (job.status === "succeeded") {
    const [variant] = await db.select().from(assetVariants).where(and(eq(assetVariants.assetId, manifest.assetId), eq(assetVariants.state, "base")));
    const [asset] = await db.select().from(assets).where(eq(assets.id, manifest.assetId));
    if (!asset || asset.seriesId !== manifest.seriesId || !variant?.filePath) throw new Error("Generated background not in smoke catalog");
    const bytes = await readFile(dataPath(variant.filePath));
    const meta = await sharp(bytes).metadata();
    if (!meta.width || !meta.height) throw new Error("Missing image dimensions");
    const ratioPass = meta.width * 9 === meta.height * 16;
    manifest.background = { filePath: variant.filePath, width: meta.width, height: meta.height, sha256: createHash("sha256").update(bytes).digest("hex"), ratioPass, assetStatus: asset.status, variantStatus: variant.status };
    manifest.status = ratioPass ? "background_awaiting_visual_review" : "blocked_background_ratio";
  } else if (job.status === "failed") manifest.status = "blocked_background_job";
  await save(manifest);
  console.log(JSON.stringify(manifest, null, 2));
  if (manifest.status.startsWith("blocked")) process.exitCode = 2;
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Smoke failed"); process.exitCode = 1; }).finally(async () => { await getPool().end(); });
