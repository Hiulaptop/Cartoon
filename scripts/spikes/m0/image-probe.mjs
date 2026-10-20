import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE = process.env.NINE_ROUTER_BASE_URL;
const KEY = process.env.NINE_ROUTER_API_KEY;
const MODEL = process.env.IMAGE_MODEL ?? "ag/gemini-3.1-flash-image";
const OUT = new URL("../../../data/spikes/m0/", import.meta.url);

if (!BASE || !KEY) throw new Error("Thiếu NINE_ROUTER_BASE_URL hoặc NINE_ROUTER_API_KEY trong .env");

const CHARACTER =
  "A 15-year-old boy named Minh, 2D flat cartoon style, thick clean black outlines, " +
  "round face, short spiky black hair, orange hoodie, blue jeans, white sneakers, " +
  "full body, front view, standing, centered, no text";

async function generate(name, prompt, extra = {}) {
  const started = performance.now();
  const res = await fetch(`${BASE}/images/generations?response_format=binary`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt, size: "1024x1024", ...extra }),
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${await res.text()}`);
  const type = res.headers.get("content-type") ?? "";
  const ext = type.includes("jpeg") ? "jpg" : "png";
  const buf = Buffer.from(await res.arrayBuffer());
  const file = new URL(`${name}.${ext}`, OUT);
  await writeFile(file, buf);
  console.log(`${name}: ${type}, ${buf.length} bytes, ${(performance.now() - started).toFixed(0)}ms`);
  return { file, type, buf };
}

await mkdir(OUT, { recursive: true });

await generate("a1-transparent", `${CHARACTER}, on a fully transparent background, PNG with alpha channel`);
const green = await generate(
  "a2-greenscreen",
  `${CHARACTER}, on a perfectly flat solid pure green (#00FF00) background, no shadows on the background`,
);
const ref = `data:${green.type || "image/png"};base64,${(await readFile(green.file)).toString("base64")}`;
await generate(
  "a3-happy-with-ref",
  `${CHARACTER}, big happy smile, on a perfectly flat solid pure green (#00FF00) background`,
  { image: ref },
);
await generate(
  "a4-happy-no-ref",
  `${CHARACTER}, big happy smile, on a perfectly flat solid pure green (#00FF00) background`,
);
