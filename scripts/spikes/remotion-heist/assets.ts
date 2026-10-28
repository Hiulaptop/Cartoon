// Explicitly requested manual smoke content, using the original asset queue/worker.
// No approval writes, imported image bytes, downstream generation, or retry loop.
import { randomUUID, createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { and, eq, desc } from "drizzle-orm";
import sharp from "sharp";
import { getDb, getPool } from "../../../src/lib/db/client";
import { series, assets, assetVariants, jobRuns } from "../../../src/lib/db/schema";
import { enqueueJob } from "../../../src/lib/queue/jobs";
import { dataPath, writeDataFile } from "../../../src/lib/storage";

const ROOT = "experiments/remotion-heist/2026-10-24-r1";
const manifestPath = `${ROOT}/assets.json`;
const definitions = {
  background: { kind: "bg", size: "1920x1080", brief: "bg_heist_harbor_far. New distant-only background for Operation Lunchbox, a friendly flat cartoon comedy. Wide landscape16:9. Pale warm morning sky, a few simple soft clouds, distant seaside town silhouettes and calm blue water. Clear level horizon at40percent of image height. Quiet low detail with large open areas. No foreground dock or floor, no platform, no characters or penguins, no crate, no table, no lunch, no boat in the foreground, no text. Foreground platform, table, lunch crate and actors are independently generated and composited later. Render the background fully to every edge." },
  pier: { kind: "prop", size: "1920x1080", brief: "prop_heist_pier_platform. One new isolated wide low wooden pier platform for a cartoon lunchtime caper. Golden tan planks, broad unobstructed flat top walking surface, dark wooden front fascia and two short support posts. Simple slight top-down three-quarter frontal perspective, consistent left-to-right flat ground line for two actors. Entire platform visible with margin. No railing, no water, no background buildings, no characters, no crate, no table or chairs, no shadows outside the object, no text. A single separate reusable scene layer, pure green background for chroma key." },
  puno: { kind: "chr", size: "1024x1024", brief: "chr_heist_puno. Generate a completely NEW base image of Puno, not an image import. Preserve these fixed identity traits: chubby stylized baby penguin, exaggerated chibi proportions, oversized rounded head, large glossy black beaded eyes, short triangular orange beak, round cream-white face/chest and pear-shaped white belly, midnight black head/back/plumage, smooth rounded black flippers with distinct bright orange vertical streaks down both flippers, short stubby orange webbed feet. No clothing or accessories. One full body centered, both feet and both flippers clearly visible, neutral alert expression, empty flippers, no prop, no crate, no table, no setting. Bold clean black outlines and simple warm cartoon shading, solid pure green background." },
  partner: { kind: "chr", size: "1024x1024", brief: "chr_heist_eli. One NEW friendly cartoon adult harbor worker named Eli, a distinct partner for a chibi penguin comedy. Medium warm brown skin, short dark curly hair under a mustard knit cap, teal long-sleeve work shirt with rolled cuffs, dark navy work trousers, simple brown work boots. Rounded friendly face, broad readable eyes, compact soft cartoon proportions, clean black outlines and flat shading. Full body centered, both boots fully visible, EMPTY HANDS naturally at sides, no held object, no crate, no table, no background scenery, no text or logo. Single person on solid pure green for chroma key. Modern clothing, no colonial costume, no resemblance to a real actor." },
  crate: { kind: "prop", size: "1024x1024", brief: "prop_heist_lunch_crate. One NEW compact wooden lunch-supply crate, a single separate reusable prop for a friendly flat cartoon heist joke. Light honey brown box made of simple clean planks, darker corner reinforcements, slightly open flat wooden lid revealing a small colorful folded paper lunch bag inside the crate as fixed contents. Simple front three-quarter view showing top and right side. Bold black outline, simple shading, complete silhouette and ample margin. No text, no letters, no branding, no people, no hands, no floor, no extra loose objects or background. Entire crate on pure green for chroma key." },
  table: { kind: "prop", size: "1024x1024", brief: "prop_heist_picnic_table. One NEW small empty wooden picnic table for two, warm light brown rectangular tabletop, simple sturdy dark brown legs and two attached short benches. Flat 2D cartoon, slightly top-down frontal three-quarter view, black clean outlines, minimal shading. Empty clear tabletop. Single complete isolated table with attached benches, all legs fully visible and margin around silhouette. No food, no crate, no characters, no water, no dock, no scenery, no text, no ground shadow outside the object. Pure green chroma-key background. This table is a separate static midground layer behind foreground characters." },
} as const;
type Key = keyof typeof definitions;
type Entry = { assetId: string; jobId?: string; generated?: { name: string; filePath: string; sha256: string; sourceWidth: number | null; sourceHeight: number | null; width: number; height: number; status: string } };
type Manifest = { runId: string; createdAt: string; seriesId: string; status: string; keys: Key[]; entries: Record<Key, Entry> };
const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const save = (manifest: Manifest) => writeDataFile(manifestPath, JSON.stringify(manifest, null, 2));
const load = async (): Promise<Manifest> => JSON.parse(await readFile(dataPath(manifestPath), "utf8"));

async function inspect(manifest: Manifest) {
  const db = getDb();
  const rows = [];
  let failed = false;
  for (const key of manifest.keys) {
    const entry = manifest.entries[key];
    if (!entry.jobId) {
      // Recover a crash after transactional enqueue but before manifest write.
      const [existing] = await db.select().from(jobRuns).where(and(eq(jobRuns.targetType, "asset"), eq(jobRuns.targetId, entry.assetId), eq(jobRuns.jobType, "asset.generate_base"))).orderBy(desc(jobRuns.createdAt)).limit(1);
      if (existing) entry.jobId = existing.id;
    }
    const [job] = entry.jobId ? await db.select().from(jobRuns).where(eq(jobRuns.id, entry.jobId)) : [];
    if (job?.status === "failed" || (job?.attempts ?? 0) > 1) failed = true;
    if (job?.status === "succeeded") {
      const [asset] = await db.select().from(assets).where(eq(assets.id, entry.assetId));
      const [variant] = await db.select().from(assetVariants).where(and(eq(assetVariants.assetId, entry.assetId), eq(assetVariants.state, "base")));
      if (!asset || asset.seriesId !== manifest.seriesId || !variant?.filePath) throw new Error("Generated asset catalog mismatch");
      const bytes = await readFile(dataPath(variant.filePath)); const meta = await sharp(bytes).metadata();
      if (!meta.width || !meta.height) throw new Error("Generated image has no dimensions");
      entry.generated = { name: asset.name, filePath: variant.filePath, sha256: hash(bytes), sourceWidth: variant.sourceWidth, sourceHeight: variant.sourceHeight, width: meta.width, height: meta.height, status: variant.status };
    }
    rows.push({ key, assetId: entry.assetId, jobId: entry.jobId ?? null, status: job?.status ?? "not_queued", attempts: job?.attempts ?? 0, image: entry.generated ?? null });
  }
  manifest.status = failed ? "blocked_asset_job" : manifest.keys.every((key) => manifest.entries[key].generated) ? "all_assets_pending_review" : "generating_new_assets";
  await save(manifest);
  return rows;
}
async function main() {
  const host = new URL(process.env.DATABASE_URL || "").hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) throw new Error("Manual smoke requires local database");
  const command = process.argv[2];
  if (!["init", "next", "status"].includes(command ?? "")) throw new Error("Usage: assets.ts init|next|status");
  await mkdir(dataPath(ROOT), { recursive: true });
  const lockPath = dataPath(`${ROOT}/command.lock`);
  const lock = await open(lockPath, "wx");
  try {
    let manifest: Manifest;
    if (command === "init") {
      const marker = await open(dataPath(`${ROOT}/started`), "wx"); await marker.close();
      const keys = Object.keys(definitions) as Key[];
      manifest = { runId: "2026-10-24-r1", createdAt: new Date().toISOString(), seriesId: randomUUID(), status: "preparing_new_assets", keys, entries: Object.fromEntries(keys.map((key) => [key, { assetId: randomUUID() }])) as Record<Key, Entry> };
      await save(manifest);
      await getDb().insert(series).values({ id: manifest.seriesId, name: "SMOKE — Puno Heist English — 2026-10-24 — all new assets" });
    } else manifest = await load();
    let rows = await inspect(manifest);
    // Each invocation queues at most one asset; inspect completed output before next.
    if (command !== "status" && manifest.status !== "blocked_asset_job" && !rows.some((row) => ["queued", "running"].includes(row.status))) {
      const key = manifest.keys.find((name) => !manifest.entries[name].jobId);
      if (key) {
        const entry = manifest.entries[key], definition = definitions[key];
        entry.jobId = await enqueueJob("asset.generate_base", { assetId: entry.assetId, seriesId: manifest.seriesId, kind: definition.kind, generationSize: definition.size, brief: definition.brief, displayName: `Heist new asset — ${key}` }, { type: "asset", id: entry.assetId });
        await save(manifest); rows = await inspect(manifest);
      }
    }
    console.log(JSON.stringify({ status: manifest.status, seriesId: manifest.seriesId, manifest: manifestPath, assets: rows }, null, 2));
  } finally { await lock.close(); await unlink(lockPath); }
}
main().catch(() => { console.error("Heist assets command stopped; inspect saved manifest and local jobs before retrying. No automatic regeneration."); process.exitCode = 1; }).finally(async () => { await getPool().end(); });
