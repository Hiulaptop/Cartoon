import path from "node:path";
import { mkdir } from "node:fs/promises";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const root = process.cwd();
const entryPoint = path.join(root, "scripts/spikes/algorithm-video/remotion-entry.tsx");
const outDir = path.join(root, "data/spikes/algorithm-video");
await mkdir(outDir, { recursive: true });
await ensureBrowser();
const serveUrl = await bundle({ entryPoint });
const inputProps = {};
const composition = await selectComposition({ serveUrl, id: "AlgorithmProbe", inputProps });
const outputLocation = path.join(outDir, "algorithm-probe.mp4");
await renderMedia({ composition, serveUrl, codec: "h264", outputLocation, inputProps });
console.log(JSON.stringify({ outputLocation, width: composition.width, height: composition.height, fps: composition.fps, durationInFrames: composition.durationInFrames }));
