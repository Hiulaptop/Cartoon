// Spike throwaway (plan voice Task 1): sinh mẫu TTS ở nhiều tốc độ/giọng, rồi kiểm Html5Audio + Sequence offset trong renderMedia h264.
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const tts = process.env.LOCAL_TTS_URL || "http://127.0.0.1:8080";
const root = process.cwd();
const out = path.join(root, "data/spikes/voice");
const publicDir = path.join(out, "public");
await mkdir(publicDir, { recursive: true });

const sentences = [
  "Mảng được chia làm hai nửa, rồi ta so sánh phần tử ở giữa với giá trị cần tìm.",
  "Độ phức tạp thời gian là ô của n lô-ga-rít n, vì mỗi tầng đệ quy xử lý n phần tử.",
  "Nếu a của i nhỏ hơn hoặc bằng n thì ta tăng con trỏ lên một, ngược lại thì dừng vòng lặp.",
];
const voices = ["Thùy Dung", "Adam"];
const speeds = [1.0, 1.25, 1.5];
const samples = [];

function wavMs(buf) {
  let o = 12, rate = 0, bytes = -1;
  while (o + 8 <= buf.length) {
    const id = buf.toString("ascii", o, o + 4); const size = buf.readUInt32LE(o + 4);
    if (id === "fmt ") rate = buf.readUInt32LE(o + 16);
    if (id === "data") { bytes = Math.min(size, buf.length - o - 8); break; }
    o += 8 + size + (size % 2);
  }
  return Math.round((bytes / rate) * 1000);
}

for (const voice of voices) for (const speed of speeds) for (const [i, text] of sentences.entries()) {
  const res = await fetch(`${tts}/synthesize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice, speed }) });
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const name = `${voice.replace(/\s/g, "_")}-${speed}-${i + 1}.wav`;
  await writeFile(path.join(out, name), buf);
  samples.push({ name, voice, speed, sentence: i + 1, bytes: buf.length, ms: wavMs(buf) });
}
console.table(samples);

// Render: hai clip ở hai offset khác nhau.
const picks = samples.filter((s) => s.voice === "Thùy Dung" && s.speed === 1.25).slice(0, 2);
const cues = [];
let from = 15;
for (const [i, pick] of picks.entries()) {
  await copyFile(path.join(out, pick.name), path.join(publicDir, `cue-${i}.wav`));
  const frames = Math.ceil((pick.ms * 30) / 1000);
  cues.push({ src: `cue-${i}.wav`, from, durationInFrames: frames });
  from += frames + 6;
}
const total = from;
await ensureBrowser();
const serveUrl = await bundle({ entryPoint: path.join(root, "scripts/spikes/algorithm-video/voice-entry.tsx"), publicDir });
const inputProps = { cues };
const composition = await selectComposition({ serveUrl, id: "VoiceProbe", inputProps });
const outputLocation = path.join(out, "voice-probe.mp4");
await renderMedia({ composition: { ...composition, durationInFrames: total }, serveUrl, codec: "h264", outputLocation, inputProps, chromiumOptions: { enableMultiProcessOnLinux: true }, licenseKey: "free-license" });
const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", outputLocation]).toString());
console.log(JSON.stringify({ cues, total, streams: probe.streams.map((s) => ({ type: s.codec_type, codec: s.codec_name, duration: s.duration })), mp4Bytes: (await stat(outputLocation)).size }, null, 2));
