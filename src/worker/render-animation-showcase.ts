import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { VERSION } from "remotion";
import { getPool } from "@/lib/db/client";
import { resolveShowcase } from "@/lib/animation/resolve";
import { draftSchema } from "@/lib/animation/schema";
import { SHOWCASE, type ShowcaseProps } from "@/lib/animation/types";
import { validateShowcase } from "@/lib/animation/validate";
import { dataPath } from "@/lib/storage";

let usedDb = false;
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("tsx src/worker/render-animation-showcase.ts --draft <path-relative-to-DATA_DIR> [--concurrency 1..4] [--stills 0,300,599]");
    return;
  }
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--draft", "--concurrency", "--stills"].includes(args[i]) || !args[i + 1] || options[args[i]] !== undefined) throw new Error("Tham số không hợp lệ; xem --help");
    options[args[i]] = args[i + 1];
  }
  if (!options["--draft"] || path.isAbsolute(options["--draft"])) throw new Error("--draft phải là đường dẫn tương đối trong DATA_DIR");
  const concurrency = Number(options["--concurrency"] ?? 1);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error("concurrency phải là số nguyên 1–4");
  const stills = options["--stills"] === undefined ? [] : options["--stills"].split(",").map(Number);
  if (stills.length > 10 || stills.some(f => !Number.isInteger(f) || f < 0 || f >= SHOWCASE.frames)) throw new Error("--stills nhận tối đa 10 frame trong khoảng 0–599");
  const inputFile = dataPath(options["--draft"]);
  if ((await stat(inputFile)).size > 128_000) throw new Error("Draft quá lớn (128 KB)");
  const draft = draftSchema.parse(JSON.parse(await readFile(inputFile, "utf8")));
  usedDb = true;
  const props = await resolveShowcase(draft, true);
  const issues = validateShowcase(props, true);
  if (issues.length) throw new Error(issues.join("\n"));
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runRel = `experiments/remotion-animation/${runId}`, runDir = dataPath(runRel), publicDir = path.join(runDir, "public");
  await mkdir(path.join(publicDir, "assets"), { recursive: true });
  const manifest: Record<string, unknown> = { status: "preparing", runId, startedAt: new Date().toISOString(), remotionVersion: VERSION, ...SHOWCASE, concurrency, audio: false, draft: props.draft, sourceAssets: props.assets, warnings: props.warnings };
  const saveManifest = () => writeFile(path.join(runDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await saveManifest();
  try {
    const snapshotAssets: ShowcaseProps["assets"] = {};
    for (const [key, asset] of Object.entries(props.assets)) {
      const rel = `assets/${asset.hash}${path.extname(asset.path)}`;
      await copyFile(dataPath(asset.path), path.join(publicDir, rel));
      snapshotAssets[key] = { ...asset, path: rel };
    }
    const inputProps: ShowcaseProps = { ...props, assets: snapshotAssets, assetMode: "static" };
    manifest.inputProps = inputProps;
    manifest.status = "rendering";
    await saveManifest();
    await ensureBrowser();
    const serveUrl = await bundle({ entryPoint: path.resolve("src/remotion/showcase/index.tsx"), publicDir,
      webpackOverride: config => ({ ...config, resolve: { ...config.resolve, alias: { ...(config.resolve?.alias ?? {}), "@": path.resolve("src") } } }) });
    const composition = await selectComposition({ serveUrl, id: "AnimationShowcase", inputProps });
    const partial = path.join(runDir, "showcase.partial.mp4");
    await renderMedia({ serveUrl, composition, inputProps, outputLocation: partial, codec: "h264", concurrency,
      licenseKey: "free-license", chromiumOptions: { enableMultiProcessOnLinux: true },
      onProgress: ({ progress }) => { if (progress === 1) console.log("Frames rendered"); } });
    await rename(partial, path.join(runDir, "showcase.mp4"));
    for (const frame of stills) await renderStill({ serveUrl, composition, inputProps, frame, output: path.join(runDir, `frame-${frame}.png`), imageFormat: "png" });
    manifest.status = "succeeded"; manifest.finishedAt = new Date().toISOString(); manifest.output = `${runRel}/showcase.mp4`; manifest.stills = stills;
    await saveManifest();
    console.log(JSON.stringify({ status: "succeeded", output: manifest.output, manifest: `${runRel}/manifest.json`, frames: composition.durationInFrames, concurrency }));
  } catch (error) {
    manifest.status = "failed"; manifest.error = error instanceof Error ? error.message : String(error); manifest.finishedAt = new Date().toISOString();
    await saveManifest();
    throw error;
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }).finally(async () => { if (usedDb) await getPool().end(); });
