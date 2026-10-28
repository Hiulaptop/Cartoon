// Approved standalone content smoke. No production scene/render handlers are changed.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, getPool } from "../../../src/lib/db/client";
import { assets, assetVariants, jobRuns, reviews, series } from "../../../src/lib/db/schema";
import { enqueueJob } from "../../../src/lib/queue/jobs";
import { dataPath, writeDataFile } from "../../../src/lib/storage";
import type { AssetKind } from "../../../src/lib/assets/naming";

const ROOT = "experiments/remotion-boston/2026-10-23-r2";
const SERIES = "33cec9f5-962f-4654-96ef-c4d347a8f687";
const manifestFile = `${ROOT}/manifest.json`;
type Entry = { assetId: string; state: string; jobId?: string; importedFrom?: string; hash?: string; review?: string };
type Manifest = { runId: string; control: string; status: string; seriesId: string; createdAt: string; entries: Record<string, Entry>; backgroundFit: Record<string, unknown>; render?: Record<string, unknown> };
const definitions: Record<string, { kind: AssetKind; size: string; brief: string }> = {
  water: { kind: "prop", size: "1920x1080", brief: "prop_boston_water. One isolated wide shallow horizontal patch of colonial harbor water, flat teal blue surface with a few simple cream blue horizontal wave lines. A single connected water-surface strip, straight horizontal top edge, no bank, no shoreline, no buildings, no boat, no people, no box, no splash. Flat cartoon thick clean outlines. It will form a static near-water layer placed below a separate dock. Solid pure green outside the water patch, no green in water." },
  pier: { kind: "prop", size: "1920x1080", brief: "prop_boston_pier. One isolated low wooden harbor dock platform, wide and horizontal, seen slightly from above in a simple three-quarter side perspective. Golden brown planks, dark stout timber front edge with a few short supporting posts below. A large unobstructed top walking surface with a clear right-hand open edge from which separately composited actors can throw crates into water. No railing blocking the top, no people, no crates, no ropes, no buildings, no water, no ship. Entire dock visible as one reusable isolated cartoon object on solid pure green." },
  ship: { kind: "prop", size: "1024x1024", brief: "prop_boston_merchant_ship. One isolated 1773 merchant sailing ship, broadside view facing left. Dark brown wooden hull with cream upper trim, two masts and simple furled cream sails, muted red small pennant without emblem. Friendly flat cartoon proportions and bold black outlines. No water, no dock, no crates, no people or figures on deck, no lettering. Entire ship including masts fully visible, centered on pure green." },
  worker: { kind: "chr", size: "1024x1024", brief: "chr_boston_docker. One full-body male colonial Boston dock worker from1773, stocky friendly cartoon adult, warm tan skin, dark short hair, plain muted red knit cap, cream shirt with rolled sleeves, navy blue waistcoat, brown trousers and sturdy dark boots. Large readable hands with five simple fingers, EMPTY HANDS, no object or crate anywhere in the character image. Single worker only. Both boots entirely visible, bold black outlines and simple flat shading, compatible with a chibi penguin cartoon. Solid green background. He is used as a separate whole-body sprite; crates are separate prop layers." },
  crate: { kind: "prop", size: "1024x1024", brief: "prop_boston_tea_crate. A single compact cubic wooden tea shipping crate from1773, golden brown planks, dark brown reinforcing corner strips, bold clean black cartoon outlines. Slight three-quarter view, front and right side and top readable, simple flat shading. No text, no letters, no stamps, no hands, no people, no extra objects, no ground shadow. One complete isolated crate centered on pure green." },
  portal: { kind: "fx", size: "1024x1024", brief: "fx_boston_portal. One single magical teleportation portal effect, upright oval luminous cyan turquoise ring with a violet inner rim and a few tiny connected cyan sparks. Open hollow center is pure green matching outside background so both center and exterior can be keyed transparent. Bold cartoon outlines, clean crisp shapes, no scene, no landscape, no character, no platform, no text. Entire ring fully visible and centered on pure green." },
  splash: { kind: "fx", size: "1024x1024", brief: "fx_boston_splash. One compact cartoon water impact splash, pale turquoise and cream blue rounded water lobes with several short droplets grouped above a small horizontal oval ripple. Single reusable effect, bold clean outlines and flat shading. No crate, no character, no ocean surface, no background scene, no lettering. Complete splash centered on solid pure green, water itself has no green." },
};
async function save(m: Manifest) { await writeDataFile(manifestFile, JSON.stringify(m, null, 2)); }
async function load(): Promise<Manifest> { return JSON.parse(await readFile(dataPath(manifestFile), "utf8")); }
function hash(bytes: Buffer) { return createHash("sha256").update(bytes).digest("hex"); }

async function importCopy(m: Manifest, key: string, sourceId: string, name: string) {
  const db = getDb(), entry = m.entries[key];
  const [source] = await db.select().from(assets).where(eq(assets.id, sourceId));
  const [variant] = await db.select().from(assetVariants).where(and(eq(assetVariants.assetId, sourceId), eq(assetVariants.state, "base")));
  if (!source || !variant?.filePath) throw new Error(`Missing import source ${key}`);
  if (key === "puno" && (source.status !== "approved" || variant.status !== "approved")) throw new Error("Puno source must remain approved");
  const bytes = await readFile(dataPath(variant.filePath)), meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height) throw new Error("Invalid source image");
  const filePath = `assets/${entry.assetId}/base.png`;
  await writeDataFile(filePath, bytes);
  await db.transaction(async (tx) => {
    await tx.insert(assets).values({ id: entry.assetId, seriesId: SERIES, name, kind: source.kind, displayName: `${source.displayName} — smoke copy`, description: source.description, generationSize: source.generationSize, status: "pending_review" }).onConflictDoNothing();
    await tx.insert(assetVariants).values({ assetId: entry.assetId, state: "base", filePath, width: meta.width, height: meta.height, sourceWidth: variant.sourceWidth, sourceHeight: variant.sourceHeight, prompt: `Imported exact bytes from ${sourceId}.base for approved smoke; source approval unchanged`, status: "pending_review" }).onConflictDoNothing();
  });
  entry.importedFrom = `${sourceId}.base`; entry.hash = hash(bytes);
  await save(m);
}
async function init() {
  const db = getDb();
  const [group] = await db.select().from(series).where(eq(series.id, SERIES));
  if (!group) throw new Error("Smoke series missing");
  // Exclusive create prevents accidental duplicate generation if start is repeated.
  await mkdir(dataPath(ROOT), { recursive: true });
  const marker = await open(dataPath(`${ROOT}/started`), "wx"); await marker.close();
  const entries: Record<string, Entry> = {};
  for (const key of ["background", "puno", ...Object.keys(definitions)]) entries[key] = { assetId: randomUUID(), state: "base" };
  const m: Manifest = { runId: "2026-10-23-r2", control: "running_user_resumed", status: "generating_assets", seriesId: SERIES, createdAt: new Date().toISOString(), entries, backgroundFit: { mode: "cover", source: [1376, 768], composition: [1920, 1080], scale: 1.40625, displayed: [1935, 1080], cropLeftRightPx: 7.5, measuredHorizonY: 0.616, groundConfirmed: false } };
  await save(m);
  await importCopy(m, "background", "98cdfadf-b198-4f94-8725-d79e0610537e", "bg_boston_harbor_smoke_cover");
  await importCopy(m, "puno", "626d9d8c-afbd-4e48-ba60-be0cf3dfe13e", "chr_puno_smoke");
  for (const [key, definition] of Object.entries(definitions)) {
    const entry = entries[key];
    entry.jobId = await enqueueJob("asset.generate_base", { assetId: entry.assetId, seriesId: SERIES, kind: definition.kind, brief: definition.brief, displayName: `Boston smoke — ${key}`, generationSize: definition.size }, { type: "asset", id: entry.assetId });
    await save(m);
  }
  console.log(JSON.stringify({ status: m.status, manifest: manifestFile, entries: m.entries }, null, 2));
}

async function inspect(m: Manifest) {
  const db = getDb(), rows = [];
  for (const [key, entry] of Object.entries(m.entries)) {
    const [a] = await db.select().from(assets).where(eq(assets.id, entry.assetId));
    const [v] = await db.select().from(assetVariants).where(and(eq(assetVariants.assetId, entry.assetId), eq(assetVariants.state, entry.state)));
    const [j] = entry.jobId ? await db.select().from(jobRuns).where(eq(jobRuns.id, entry.jobId)) : [];
    rows.push({ key, assetId: entry.assetId, name: a?.name, state: entry.state, assetStatus: a?.status, status: v?.status, filePath: v?.filePath, width: v?.width, height: v?.height, job: j ? { id: j.id, status: j.status, attempts: j.attempts, error: j.error } : null });
  }
  await writeDataFile(`${ROOT}/catalog-status.json`, JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
}

async function approve(m: Manifest, key: string, reason: string) {
  if (reason.length < 25) throw new Error("Provide concrete visual review reason after viewing image");
  const e = m.entries[key]; if (!e) throw new Error("Unknown smoke entry");
  const db = getDb();
  const [a] = await db.select().from(assets).where(eq(assets.id, e.assetId));
  const [v] = await db.select().from(assetVariants).where(and(eq(assetVariants.assetId, e.assetId), eq(assetVariants.state, e.state)));
  if (!a || a.seriesId !== SERIES || !v?.filePath || v.status !== "pending_review") throw new Error("Only pending_review smoke copies/variants may be approved");
  const bytes = await readFile(dataPath(v.filePath)), meta = await sharp(bytes).metadata();
  if (meta.width !== v.width || meta.height !== v.height) throw new Error("File/catalog dimension mismatch");
  if (a.kind !== "bg" && (await sharp(bytes).stats()).isOpaque) throw new Error("Cutout must contain actual transparent pixels");
  if (e.importedFrom && e.hash !== hash(bytes)) throw new Error("Imported bytes changed");
  await db.transaction(async (tx) => {
    if (e.state === "base") await tx.update(assets).set({ status: "approved" }).where(eq(assets.id, a.id));
    await tx.update(assetVariants).set({ status: "approved" }).where(eq(assetVariants.id, v.id));
    await tx.insert(reviews).values({ targetType: "asset_variant", targetId: v.id, decision: "approved", reason: `Agent visual review, approved Boston smoke scope (not user art approval): ${reason}` });
  });
  e.hash = hash(bytes); e.review = reason; await save(m);
  console.log(`Approved ${key}: ${v.width}x${v.height}`);
}

async function workerPose(m: Manifest) {
  if (m.entries.worker_angry) throw new Error("Worker pose already queued");
  const base = m.entries.worker;
  const [a] = await getDb().select().from(assets).where(eq(assets.id, base.assetId));
  if (a?.status !== "approved") throw new Error("Review worker base before pose generation");
  m.entries.worker_angry = { assetId: base.assetId, state: "angry" };
  await save(m);
  m.entries.worker_angry.jobId = await enqueueJob("asset.generate_variant", { assetId: base.assetId, state: "angry", feedback: "This is an action sprite of the SAME worker. Keep red cap, cream shirt, navy waistcoat, brown trousers, boots, facial identity and proportions. BOTH HANDS EMPTY, no crate or object drawn anywhere. Raise and extend both bare arms toward viewer-right in a release/throw gesture, open palms. Full body with both boots visible. Solid pure green background. A separate crate prop will be animated independently; absolutely do not draw a crate, barrel or second person." }, { type: "asset", id: base.assetId });
  await save(m); console.log(JSON.stringify(m.entries.worker_angry));
}

async function render(m: Manifest, stillOnly: boolean) {
  if (!stillOnly && m.backgroundFit.groundConfirmed !== true) throw new Error("Review stills and confirm layout before video export");
  const { bundle } = await import("@remotion/bundler");
  const { ensureBrowser, selectComposition, renderStill, renderMedia } = await import("@remotion/renderer");
  const { VERSION } = await import("remotion");
  const { SCENE_LAYOUT } = await import("./scene");
  const db = getDb();
  const publicDir = dataPath(`${ROOT}/public`); await mkdir(publicDir, { recursive: true });
  const snapshot: Record<string, { path: string; width: number; height: number }> = {};
  const sources = [];
  for (const key of ["background", "puno", ...Object.keys(definitions), "worker_angry"]) {
    const e = m.entries[key]; if (!e?.hash || !e.review) throw new Error(`Visual approval/hash missing ${key}`);
    const [a] = await db.select().from(assets).where(eq(assets.id, e.assetId));
    const [v] = await db.select().from(assetVariants).where(and(eq(assetVariants.assetId, e.assetId), eq(assetVariants.state, e.state)));
    if (a?.seriesId !== SERIES || a.status !== "approved" || v?.status !== "approved" || !v.filePath || !v.width || !v.height) throw new Error(`Catalog gate failed ${key}`);
    const bytes = await readFile(dataPath(v.filePath)); if (hash(bytes) !== e.hash) throw new Error(`Fingerprint mismatch ${key}`);
    const rel = `${key}-${e.hash}.png`; await writeFile(path.join(publicDir, rel), bytes);
    snapshot[key] = { path: rel, width: v.width, height: v.height };
    sources.push({ key, ...e, variantId: v.id, filePath: v.filePath, width: v.width, height: v.height });
  }
  const inputProps = { images: snapshot };
  const codeFingerprints: Record<string, string> = {};
  await mkdir(dataPath(`${ROOT}/source`), { recursive: true });
  for (const file of ["scene.tsx", "index.tsx", "resume.ts"]) {
    const bytes = await readFile(path.resolve("scripts/spikes/remotion-boston", file));
    codeFingerprints[file] = hash(bytes); await writeDataFile(`${ROOT}/source/${file}.txt`, bytes);
  }
  const lockHash = hash(await readFile(path.resolve("package-lock.json")));
  m.render = { status: "preparing", remotionVersion: VERSION, frames: 900, fps: 30, width: 1920, height: 1080, audio: false, concurrency: 1, inputProps, sources, backgroundFit: m.backgroundFit, sceneLayout: SCENE_LAYOUT, codeFingerprints, packageLockHash: lockHash };
  await save(m);
  const saveRender = () => writeDataFile(`${ROOT}/render-manifest.json`, JSON.stringify(m.render, null, 2));
  await saveRender();
  try {
    await ensureBrowser();
    const serveUrl = await bundle({ entryPoint: path.resolve("scripts/spikes/remotion-boston/index.tsx"), publicDir });
    const composition = await selectComposition({ serveUrl, id: "BostonTeaParty", inputProps });
    for (const frame of [0, 105, 260, 345, 410, 525, 645, 765, 899]) await renderStill({ serveUrl, composition, inputProps, frame, output: dataPath(`${ROOT}/frame-${frame}.png`), imageFormat: "png" });
    if (!stillOnly) {
      m.render.status = "rendering"; await saveRender();
      const partial = dataPath(`${ROOT}/boston.partial.mp4`);
      let last = -1;
      await renderMedia({ serveUrl, composition, inputProps, outputLocation: partial, codec: "h264", concurrency: 1, licenseKey: "free-license", onProgress: ({ progress }) => { const step = Math.floor(progress * 10); if (step !== last) { last = step; console.log(`Render ${step * 10}%`); } } });
      await rename(partial, dataPath(`${ROOT}/boston.mp4`));
      m.render.output = `${ROOT}/boston.mp4`; m.status = "rendered_awaiting_visual_metadata_check";
    }
    m.render.status = stillOnly ? "stills_ready" : "rendered"; await saveRender(); await save(m);
    console.log(JSON.stringify({ status: m.render.status, root: ROOT }));
  } catch (error) {
    m.render.status = "failed"; m.render.error = error instanceof Error ? error.message : "Render failure";
    await saveRender(); await save(m); throw error;
  }
}

let locked = false;
async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Local DB required");
  const command = process.argv[2];
  if (!["init", "status", "approve", "worker-pose", "stills", "render", "confirm-layout"].includes(command)) throw new Error("Usage: resume.ts init|status|approve <key> <reason>|worker-pose|stills|confirm-layout <reason>|render");
  await mkdir(dataPath(ROOT), { recursive: true });
  const lock = await open(dataPath(`${ROOT}/command.lock`), "wx"); await lock.close(); locked = true;
  if (command === "init") return init();
  const m = await load();
  if (command === "confirm-layout") {
    const reason = process.argv[3] ?? "";
    if (reason.length < 25) throw new Error("Concrete still review reason required");
    m.backgroundFit.groundConfirmed = true; m.backgroundFit.layoutReview = reason; await save(m); return;
  }
  if (command === "status") return inspect(m);
  if (command === "approve") return approve(m, process.argv[3], process.argv[4] ?? "");
  if (command === "worker-pose") return workerPose(m);
  return render(m, command === "stills");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Smoke failed"); process.exitCode = 1; }).finally(async () => { await getPool().end(); if (locked) await unlink(dataPath(`${ROOT}/command.lock`)); });

