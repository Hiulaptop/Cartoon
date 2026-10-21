import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.NINE_ROUTER_BASE_URL;
const KEY = process.env.NINE_ROUTER_API_KEY;
// `||` chứ không `??`: IMAGE_MODEL= (rỗng, chép từ .env.example) cũng phải về mặc định.
const MODEL = process.env.IMAGE_MODEL || "ag/gemini-3.1-flash-image";
const TIMEOUT_MS = 180_000;
const OUT = new URL("../../../data/spikes/m0/", import.meta.url);

if (!BASE || !KEY) throw new Error("Thiếu NINE_ROUTER_BASE_URL hoặc NINE_ROUTER_API_KEY trong .env");

const CHARACTER =
  "A 15-year-old boy named Minh, 2D flat cartoon style, thick clean black outlines, " +
  "round face, short spiky black hair, orange hoodie, blue jeans, white sneakers, " +
  "full body, front view, standing, centered, no text";

// Router trả Content-Type sai (ghi image/png cho dữ liệu JPEG), nên đọc định dạng từ magic bytes.
function sniff(buf) {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return { mime: "image/png", ext: "png" };
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP")
    return { mime: "image/webp", ext: "webp" };
  throw new Error(`Không nhận ra định dạng ảnh (4 byte đầu: ${buf.subarray(0, 4).toString("hex")})`);
}

async function generate(name, prompt, extra = {}) {
  const started = performance.now();
  const res = await fetch(`${BASE}/images/generations?response_format=binary`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", ...extra }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  const header = res.headers.get("content-type") ?? "";
  const buf = Buffer.from(await res.arrayBuffer());
  const { mime, ext } = sniff(buf);
  await writeFile(new URL(`${name}.${ext}`, OUT), buf);
  console.log(
    `${name}: header=${header}, thực tế=${mime}, ${buf.length} bytes, ${(performance.now() - started).toFixed(0)}ms`,
  );
  return { mime, buf };
}

await mkdir(OUT, { recursive: true });

await generate("a1-transparent", `${CHARACTER}, on a fully transparent background, PNG with alpha channel`);
const green = await generate(
  "a2-greenscreen",
  `${CHARACTER}, on a perfectly flat solid pure green (#00FF00) background, no shadows on the background`,
);
const ref = `data:${green.mime};base64,${green.buf.toString("base64")}`;
await generate(
  "a3-happy-with-ref",
  `${CHARACTER}, big happy smile, on a perfectly flat solid pure green (#00FF00) background`,
  { image: ref },
);
await generate(
  "a4-happy-no-ref",
  `${CHARACTER}, big happy smile, on a perfectly flat solid pure green (#00FF00) background`,
);
