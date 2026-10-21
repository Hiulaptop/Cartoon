import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";

// Mọi file (ảnh asset, video render...) nằm trong DATA_DIR. Đổi sang object storage sau này chỉ cần sửa module này.
export function dataRoot(): string {
  return path.resolve(process.env.DATA_DIR || "data");
}

// Đường dẫn tương đối (dùng "/") → đường dẫn tuyệt đối trong DATA_DIR. Chặn mọi đường dẫn thoát ra ngoài.
export function dataPath(relative: string): string {
  const root = dataRoot();
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Đường dẫn nằm ngoài DATA_DIR: ${relative}`);
  }
  return full;
}

// Ghi ra file tạm rồi đổi tên: người đọc không bao giờ thấy file ghi dở.
export async function writeDataFile(relative: string, data: Buffer | string): Promise<void> {
  const target = dataPath(relative);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, target);
}

export async function readDataFile(relative: string): Promise<Buffer> {
  return readFile(dataPath(relative));
}

export async function dataFileInfo(relative: string): Promise<Stats | null> {
  try {
    return await stat(dataPath(relative));
  } catch {
    return null;
  }
}
