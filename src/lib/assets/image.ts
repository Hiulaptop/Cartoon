import sharp from "sharp";

// Xử lý ảnh sinh ra (kết luận M0, spec §5 bước 1):
// model không cho nền trong suốt, nên sinh trên nền #00FF00 rồi tách nền, khử ám xanh ở viền, cắt sát.

export type ProcessedImage = { data: Buffer; width: number; height: number };

// Ngưỡng đã thử ở M0: loại 82–84% điểm ảnh nền, giữ nguyên nhân vật.
function isKeyGreen(r: number, g: number, b: number): boolean {
  return g > 140 && g > r * 1.4 && g > b * 1.4;
}

// Model ảnh đôi khi vẽ nền xanh lệch khỏi #00FF00 (xanh chuối, xanh vàng) nên ngưỡng cố định bỏ sót.
// Lấy màu nền thật = trung vị các điểm ảnh ở viền; nếu là màu xanh lá thì xoá vùng gần màu đó LIÊN THÔNG với viền
// (lan từ mép vào), để không xoá chi tiết xanh nằm bên trong vật thể.
const FLOOD_DISTANCE = 90;

function borderMedian(px: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    rs.push(px[i]); gs.push(px[i + 1]); bs.push(px[i + 2]);
  };
  for (let x = 0; x < width; x++) { push(x, 0); push(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { push(0, y); push(width - 1, y); }
  const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return [median(rs), median(gs), median(bs)];
}

function floodBackground(px: Uint8ClampedArray, width: number, height: number) {
  const [br, bg, bb] = borderMedian(px, width, height);
  if (!(bg > 120 && bg > br * 1.15 && bg > bb * 1.15)) return;
  const near = (i: number) => (px[i] - br) ** 2 + (px[i + 1] - bg) ** 2 + (px[i + 2] - bb) ** 2 < FLOOD_DISTANCE ** 2;
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    const i = p * 4;
    if (px[i + 3] === 0 || near(i)) { px[i + 3] = 0; queue.push(p); }
  };
  for (let x = 0; x < width; x++) { visit(x, 0); visit(x, height - 1); }
  for (let y = 0; y < height; y++) { visit(0, y); visit(width - 1, y); }
  while (queue.length) {
    const p = queue.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) visit(x - 1, y);
    if (x < width - 1) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y < height - 1) visit(x, y + 1);
  }
}

export async function keyAndTrim(input: Buffer): Promise<ProcessedImage> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);

  for (let i = 0; i < px.length; i += 4) {
    if (isKeyGreen(px[i], px[i + 1], px[i + 2])) px[i + 3] = 0;
  }
  floodBackground(px, width, height);

  // Khử ám xanh: điểm ảnh còn giữ nằm sát vùng đã tách thì kẹp kênh xanh về max(đỏ, lam).
  // Chỉ làm ở viền để không đổi màu áo/đồ vật màu xanh bên trong.
  const transparent = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height || px[(y * width + x) * 4 + 3] === 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (px[i + 3] === 0) continue;
      if (transparent(x - 1, y) || transparent(x + 1, y) || transparent(x, y - 1) || transparent(x, y + 1)) {
        px[i + 1] = Math.min(px[i + 1], Math.max(px[i], px[i + 2]));
      }
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("Ảnh rỗng sau khi tách nền (toàn bộ là nền xanh)");

  const trimmed = await sharp(Buffer.from(px.buffer, px.byteOffset, px.length), {
    raw: { width, height, channels: 4 },
  })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data: trimmed.data, width: trimmed.info.width, height: trimmed.info.height };
}

// Bối cảnh không tách nền: chỉ chuẩn hóa sang PNG.
export async function toPng(input: Buffer): Promise<ProcessedImage> {
  const out = await sharp(input).png().toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}
