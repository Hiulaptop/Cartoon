// Manual smoke staging: explicit asset approval, original-script draft, SceneDSL previews.
// Never approves script/scenes/audio or invokes image/TTS generation.
// Only generate-script queues the original script.generate handler, explicitly.
import { randomUUID, createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { and, eq, desc } from "drizzle-orm";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderStill, selectComposition } from "@remotion/renderer";
import { getDb, getPool } from "../../../src/lib/db/client";
import { assets, assetVariants, projects, reviews, scripts, videos, jobRuns } from "../../../src/lib/db/schema";
import { enqueueJob } from "../../../src/lib/queue/jobs";
import { loadApprovedCatalog } from "../../../src/lib/scene/catalog";
import { sceneDslSchema, type SceneDsl } from "../../../src/lib/scene/schema";
import { checkSceneDsl } from "../../../src/lib/scene/check";
import { checkScript } from "../../../src/lib/script/check";
import { ensureDefaultCombo } from "../../../src/lib/script/combo";
import { scriptContentSchema, scriptSchema, type ScriptV1 } from "../../../src/lib/script/schema";
import { dataPath, writeDataFile } from "../../../src/lib/storage";
import { objectHash } from "../../../src/lib/audio/fingerprint";
import type { VideoProps } from "../../../src/remotion/VideoComposition";

const ROOT = "experiments/remotion-heist/2026-10-24-r1";
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type AssetManifest = { seriesId: string; entries: Record<string, { assetId: string; generated: { name: string; filePath: string; sha256: string } }> };
type Prepared = { videoId: string; scriptId: string; projectId: string; seriesId: string; status: string; script: ScriptV1; scenes: SceneDsl[]; stills?: string[]; generatedScriptId?: string; scriptJobId?: string; manualDraftScriptId?: string };
const manifest = async (): Promise<AssetManifest> => JSON.parse(await readFile(dataPath(`${ROOT}/assets.json`), "utf8"));
const save = (prepared: Prepared) => writeDataFile(`${ROOT}/prepared.json`, JSON.stringify(prepared, null, 2));

async function approveAssets(m: AssetManifest) {
  const db = getDb();
  for (const entry of Object.values(m.entries)) {
    if (!entry.generated || hash(await readFile(dataPath(entry.generated.filePath))) !== entry.generated.sha256) throw new Error("Asset changed after user review");
  }
  await db.transaction(async (tx) => {
    for (const entry of Object.values(m.entries)) {
      const [asset] = await tx.select().from(assets).where(and(eq(assets.id, entry.assetId), eq(assets.seriesId, m.seriesId))).for("update");
      const [variant] = await tx.select().from(assetVariants).where(and(eq(assetVariants.assetId, entry.assetId), eq(assetVariants.state, "base"))).for("update");
      if (!asset || !variant || variant.filePath !== entry.generated.filePath) throw new Error("Asset ownership/file mismatch");
      if (asset.status === "approved" && variant.status === "approved") continue;
      if (asset.status !== "pending_review" || variant.status !== "pending_review") throw new Error("Asset not pending user review");
      await tx.update(assets).set({ status: "approved" }).where(eq(assets.id, asset.id));
      await tx.update(assetVariants).set({ status: "approved" }).where(eq(assetVariants.id, variant.id));
      await tx.insert(reviews).values({ targetType: "asset_variant", targetId: variant.id, decision: "approved", reason: "Explicit user chat approval2026-10-24: duyệt bước asset, tiếp tục. Scope: all6new heist assets." });
    }
  });
  await writeDataFile(`${ROOT}/asset-approval.json`, JSON.stringify({ approvedAt: new Date().toISOString(), source: "user-chat", instruction: "duyệt bước asset, tiếp tục", entries: m.entries }, null, 2));
  console.log(JSON.stringify({ status: "assets_approved", count: Object.keys(m.entries).length, seriesId: m.seriesId }));
}

function draft(m: AssetManifest) {
  const ref = (key: string) => `@${m.entries[key].generated.name}`;
  const puno = ref("puno"), eli = ref("partner"), background = ref("background");
  const script = scriptSchema.parse({ version: 1, title: "Operation: Lunchbox", logline: "Puno plans an elaborate snack heist until Eli points out that lunch is free.", targetSeconds: 30, beats: [
    { id: "b1", role: "hook", summary: "Puno treats lunch like a secret mission.", location: background, characters: [puno, eli], lines: [{ speaker: puno, text: "Nobody leaves this pier hungry." }], actions: ["Puno takes one small step toward the separate lunch crate.", "Eli waits beside the empty picnic table."], gag: { kind: "situational", setupBeat: "b1", note: "An ordinary lunch is treated as an elaborate covert operation." }, seconds: 4 },
    { id: "b2", role: "escalation", summary: "Puno describes a getaway. Eli calmly reveals lunch is free.", location: background, characters: [puno, eli], lines: [{ speaker: puno, text: "Distract the guard. I'll grab the crate. We vanish." }, { speaker: eli, text: "Puno, that's the free lunch box." }], actions: ["Camera moves closer while Puno explains.", "Eli calmly looks toward the crate without lifting or holding it."], seconds: 13 },
    { id: "b3", role: "punchline", summary: "Puno turns the getaway into a picnic and the masks into napkins.", location: background, characters: [puno, eli], lines: [{ speaker: puno, text: "Then our getaway vehicle is... a table." }, { speaker: eli, text: "And the masks?" }, { speaker: puno, text: "Napkins." }], actions: ["Camera reveals the empty table, separate from the characters.", "Both characters hold still for the final reaction beat."], gag: { kind: "callback", setupBeat: "b1", note: "The covert mission vocabulary is reframed as an ordinary picnic." }, seconds: 13 },
  ] });
  const scene = (durationFrames: number, camera: SceneDsl["camera"], dialogue: SceneDsl["dialogue"], walking = false) => sceneDslSchema.parse({
    version: 1, durationFrames, background: { ref: background },
    characters: [
      { id: "heist_puno", ref: puno, x: 0.30, y: 0.83, height: 0.32, flip: false, states: [{ at: 0, state: "base" }], moves: walking ? [{ from: 15, to: 100, x: 0.33, y: 0.83 }] : [] },
      { id: "heist_eli", ref: eli, x: 0.68, y: 0.83, height: 0.47, flip: true, states: [{ at: 0, state: "base" }], moves: [] },
    ],
    props: [
      { id: "pier", ref: ref("pier"), x: 0.5, y: 1.02, height: 0.4, from: 0, to: durationFrames },
      { id: "table", ref: ref("table"), x: 0.66, y: 0.75, height: 0.17, from: 0, to: durationFrames },
      { id: "lunch", ref: ref("crate"), x: 0.49, y: 0.83, height: 0.14, from: 0, to: durationFrames },
    ], effects: [], dialogue, camera, transition: { in: "cut", out: "cut", frames: 12 },
  });
  const scenes = [
    scene(120, [{ at: 0, zoom: 1, fx: 0.5, fy: 0.65 }, { at: 119, zoom: 1.02, fx: 0.5, fy: 0.65 }], [{ speaker: "heist_puno", text: script.beats[0].lines[0].text, from: 15, to: 105 }], true),
    scene(390, [{ at: 0, zoom: 1.12, fx: 0.43, fy: 0.65 }, { at: 389, zoom: 1.12, fx: 0.43, fy: 0.65 }], [{ speaker: "heist_puno", text: script.beats[1].lines[0].text, from: 45, to: 195 }, { speaker: "heist_eli", text: script.beats[1].lines[1].text, from: 240, to: 345 }]),
    scene(390, [{ at: 0, zoom: 1.08, fx: 0.58, fy: 0.65 }, { at: 389, zoom: 1, fx: 0.58, fy: 0.65 }], [{ speaker: "heist_puno", text: script.beats[2].lines[0].text, from: 30, to: 165 }, { speaker: "heist_eli", text: script.beats[2].lines[1].text, from: 195, to: 255 }, { speaker: "heist_puno", text: script.beats[2].lines[2].text, from: 300, to: 345 }]),
  ];
  // Keep the end of the first walk continuous at the next cut.
  scenes[1].characters[0].x = 0.33; scenes[2].characters[0].x = 0.33;
  return { script, scenes };
}

async function prepare(m: AssetManifest) {
  try { const existing = JSON.parse(await readFile(dataPath(`${ROOT}/prepared.json`), "utf8")) as Prepared; console.log(JSON.stringify({ status: existing.status, videoId: existing.videoId, scriptId: existing.scriptId, reused: true })); return; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const catalog = await loadApprovedCatalog(m.seriesId);
  if (catalog.size !== 6) throw new Error("Expected all6approved assets in this isolated series");
  const combo = await ensureDefaultCombo(); const content = draft(m);
  const issues = checkScript(content.script, catalog, combo.definition);
  content.scenes.forEach((scene, index) => issues.push(...checkSceneDsl(scene, catalog).issues.map((issue) => `scene${index + 1}: ${issue}`)));
  if (issues.length) throw new Error(issues.join("; "));
  const prepared: Prepared = { videoId: randomUUID(), scriptId: randomUUID(), projectId: randomUUID(), seriesId: m.seriesId, status: "script_pending_review_layout_draft", ...content };
  const scriptContent = scriptContentSchema.parse({ meta: { assetNames: [...catalog.keys()], targetSeconds: 30 }, script: content.script, issues: [] });
  await getDb().transaction(async (tx) => {
    await tx.insert(projects).values({ id: prepared.projectId, name: "SMOKE — Operation Lunchbox — 2026-10-24" });
    await tx.insert(videos).values({ id: prepared.videoId, seriesId: m.seriesId, projectId: prepared.projectId, title: "Operation: Lunchbox — English voiceover smoke", brief: "New original dialogue inspired by the broad heist-planning setup, using all6new generated assets. Manual ScriptV1/SceneDSL draft for audio integration smoke; script.generate and scenes.generate are not claimed verified. No source video/audio copied.", comboId: combo.id, status: "scripting" });
    await tx.insert(scripts).values({ id: prepared.scriptId, videoId: prepared.videoId, version: 1, model: "manual-smoke-original", content: scriptContent, status: "pending_review" });
  });
  await save(prepared);
  await writeDataFile(`${ROOT}/scene-drafts.json`, JSON.stringify({ status: "draft-not-approved", productionSceneRowsCreated: false, fps: 30, frames: 900, horizonObserved: 0.655, groundConfirmed: false, scenes: content.scenes }, null, 2));
  console.log(JSON.stringify({ status: prepared.status, videoId: prepared.videoId, scriptId: prepared.scriptId, scenes: content.scenes.length, frames: 900 }));
}

async function stills(m: AssetManifest) {
  const prepared = JSON.parse(await readFile(dataPath(`${ROOT}/prepared.json`), "utf8")) as Prepared;
  const catalog = await loadApprovedCatalog(m.seriesId);
  const props: VideoProps = { scenes: [], assetMode: "static" };
  const publicDir = dataPath(`${ROOT}/layout/public`); await mkdir(publicDir, { recursive: true });
  const used = new Map<string, string>();
  for (const raw of prepared.scenes) {
    const dsl = sceneDslSchema.parse(raw); const checked = checkSceneDsl(dsl, catalog);
    if (checked.issues.length) throw new Error(checked.issues.join("; "));
    props.scenes.push({ dsl, assets: checked.assets });
    for (const asset of Object.values(checked.assets)) {
      const expected = Object.values(m.entries).find((entry) => entry.generated.filePath === asset.path)?.generated.sha256;
      if (!expected) throw new Error("Preview uses unlisted image");
      used.set(asset.path, expected);
    }
  }
  for (const [rel, expected] of used) {
    const target = path.join(publicDir, rel); await mkdir(path.dirname(target), { recursive: true });
    await copyFile(dataPath(rel), target);
    if (hash(await readFile(target)) !== expected) throw new Error("Snapshot image hash mismatch");
  }
  await ensureBrowser();
  const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/index.ts"), publicDir, webpackOverride: (config) => ({ ...config, resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve("src") } } }) });
  const composition = await selectComposition({ serveUrl, id: "Video", inputProps: props });
  if (composition.durationInFrames !== 900) throw new Error("Preview must contain900frames");
  const outputs: string[] = [];
  for (const frame of [60, 210, 450, 660, 840, 899]) {
    const output = `${ROOT}/layout/frame-${frame}.png`;
    await renderStill({ serveUrl, composition, inputProps: props, frame, output: dataPath(output), imageFormat: "png", licenseKey: "free-license" });
    outputs.push(output);
  }
  prepared.stills = outputs; await save(prepared);
  await writeDataFile(`${ROOT}/layout/manifest.json`, JSON.stringify({ kind: "manual-layout-preview-only", audio: false, mp4Created: false, sceneRowsCreated: false, scriptStatus: "pending_review", frames: 900, width: 1920, height: 1080, fps: 30, imageHashes: Object.fromEntries(used), lockHash: hash(await readFile("package-lock.json")), inputProps: props, outputs }, null, 2));
  console.log(JSON.stringify({ status: "layout_preview_ready", videoId: prepared.videoId, outputs }));
}

async function generateScript(m: AssetManifest) {
  const prepared = JSON.parse(await readFile(dataPath(`${ROOT}/prepared.json`), "utf8")) as Prepared;
  const catalog = await loadApprovedCatalog(m.seriesId);
  const result = await getDb().transaction(async (tx) => {
    await tx.select().from(videos).where(eq(videos.id, prepared.videoId)).for("update");
    if (prepared.generatedScriptId && prepared.scriptJobId) return { scriptId: prepared.generatedScriptId, jobId: prepared.scriptJobId };
    const [latest] = await tx.select().from(scripts).where(eq(scripts.videoId, prepared.videoId)).orderBy(desc(scripts.version)).limit(1);
    // Recover a lost manifest write; never generate another version on a rerun.
    if (latest && latest.id !== prepared.scriptId) {
      const [job] = await tx.select().from(jobRuns).where(and(eq(jobRuns.jobType, "script.generate"), eq(jobRuns.targetId, latest.id))).orderBy(desc(jobRuns.createdAt)).limit(1);
      if (!job) throw new Error("Latest script has no generation job; inspect before continuing");
      return { scriptId: latest.id, jobId: job.id };
    }
    const brief = "Original English cartoon smoke, inspired only by a broad heist-planning comedy setup, not a transcript/remake of any video. Use exactly3beats and30seconds: b1hook4s, b2escalation13s, b3punchline13s. Use Puno and Eli and the6approved assets. Preserve the following original English lines, speakers and ordering; invent only staging/actions/gag notes. No extra speech, characters, props or scenes. JSON of the requested original outline: " + JSON.stringify(prepared.script);
    await tx.update(videos).set({ brief }).where(eq(videos.id, prepared.videoId));
    const [row] = await tx.insert(scripts).values({ videoId: prepared.videoId, version: (latest?.version ?? 0) + 1, status: "generating", content: { meta: { assetNames: [...catalog.keys()], targetSeconds: 30 } } }).returning({ id: scripts.id });
    const jobId = await enqueueJob("script.generate", { scriptId: row.id }, { type: "script", id: row.id }, tx);
    return { scriptId: row.id, jobId };
  });
  prepared.generatedScriptId = result.scriptId; prepared.scriptJobId = result.jobId; prepared.status = "production_script_generation_queued_manual_layout_preview_only";
  await save(prepared); console.log(JSON.stringify(result));
}

async function syncGeneratedScript() {
  const prepared = JSON.parse(await readFile(dataPath(`${ROOT}/prepared.json`), "utf8")) as Prepared;
  if (!prepared.generatedScriptId) throw new Error("No production script job recorded");
  const [row] = await getDb().select().from(scripts).where(and(eq(scripts.id, prepared.generatedScriptId), eq(scripts.videoId, prepared.videoId)));
  if (!row || !["pending_review", "approved"].includes(row.status)) throw new Error("Production script not ready");
  const parsed = scriptContentSchema.parse(row.content);
  if (!parsed.script) throw new Error("Production script missing");
  const spokenOutline = (script: ScriptV1) => script.beats.map((beat) => ({ seconds: beat.seconds, location: beat.location, lines: beat.lines }));
  if (objectHash(spokenOutline(parsed.script)) !== objectHash(spokenOutline(prepared.script))) throw new Error("Production dialogue/timing changed; update layout preview before review");
  prepared.manualDraftScriptId ??= prepared.scriptId;
  if (prepared.manualDraftScriptId !== row.id) {
    // Keep the internal staging draft, but only the generated version needs human review.
    await getDb().update(scripts).set({ status: "draft" }).where(and(eq(scripts.id, prepared.manualDraftScriptId), eq(scripts.model, "manual-smoke-original"), eq(scripts.status, "pending_review")));
  }
  prepared.scriptId = row.id; prepared.script = parsed.script; prepared.status = "production_script_pending_review_layout_preview_ready";
  await save(prepared);
  const preview = JSON.parse(await readFile(dataPath(`${ROOT}/layout/manifest.json`), "utf8"));
  await writeDataFile(`${ROOT}/layout/manifest.json`, JSON.stringify({ ...preview, scriptId: row.id, scriptVersion: row.version, scriptModel: row.model, dialogueAndDurationsMatchGenerated: true, generatedScriptHash: objectHash(parsed.script) }, null, 2));
  console.log(JSON.stringify({ status: prepared.status, scriptId: row.id, version: row.version, layoutDialogueMatches: true }));
}

async function main() {
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL || "").hostname)) throw new Error("Local database only");
  const command = process.argv[2]; const m = await manifest();
  const lockPath = dataPath(`${ROOT}/command.lock`); const lock = await open(lockPath, "wx");
  try {
    if (command === "approve-assets") await approveAssets(m);
    else if (command === "prepare") await prepare(m);
    else if (command === "stills") await stills(m);
    else if (command === "generate-script") await generateScript(m);
    else if (command === "sync-script") await syncGeneratedScript();
    else throw new Error("Usage: prepare.ts approve-assets|prepare|stills|generate-script|sync-script");
  } finally { await lock.close(); await unlink(lockPath); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Heist preparation stopped"); process.exitCode = 1; }).finally(async () => { await getPool().end(); });
