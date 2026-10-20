import os from "node:os";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const outDir = process.env.OUT_DIR ?? "out";

console.log(`CPU cores: ${os.cpus().length}`);
let t = performance.now();
const serveUrl = await bundle({ entryPoint: require.resolve("./src/index.ts"), webpackOverride: (c) => c });
console.log(`bundle: ${((performance.now() - t) / 1000).toFixed(1)}s`);

const composition = await selectComposition({ serveUrl, id: "Probe", inputProps: {} });
t = performance.now();
// licenseKey bỏ trống: user chưa xác nhận đủ điều kiện free-license (tối đa 3 người vận hành).
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: `${outDir}/probe.mp4`,
  inputProps: {},
  chromiumOptions: { enableMultiProcessOnLinux: true },
});
const secs = (performance.now() - t) / 1000;
console.log(`render: ${secs.toFixed(1)}s cho ${composition.durationInFrames / composition.fps}s video`);
