import path from "node:path";
import sharp from "sharp";

const [, , ...args] = process.argv;
const key = args.includes("--key");
const files = args.filter((a) => a !== "--key");
if (files.length === 0) throw new Error("Usage: alpha-check.mjs [--key] <image>...");

for (const file of files) {
  const meta = await sharp(file).metadata();
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  let transparent = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 16) transparent++;
  const total = info.width * info.height;
  console.log(
    `${file}: ${meta.format} ${info.width}x${info.height}, hasAlpha=${meta.hasAlpha}, ` +
      `transparent=${((transparent / total) * 100).toFixed(1)}%`,
  );

  if (!key) continue;
  let keyed = 0;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    if (g > 140 && g > r * 1.4 && g > b * 1.4) {
      px[i + 3] = 0;
      keyed++;
    }
  }
  // Tên ra luôn khác tên vào, kể cả với đuôi .JPEG/.webp, để không ghi đè ảnh gốc.
  const { dir, name } = path.parse(file);
  const out = path.join(dir, `${name}-keyed.png`);
  await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toFile(out);
  console.log(`  keyed ${((keyed / total) * 100).toFixed(1)}% -> ${out}`);
}
