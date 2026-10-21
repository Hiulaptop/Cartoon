import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { dataFileInfo, dataPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

// Trả file trong DATA_DIR cho trình duyệt (ảnh asset...). dataPath() chặn đường dẫn thoát ra ngoài.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const relative = (await params).path.join("/");
  let full: string;
  try {
    full = dataPath(relative);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const info = await dataFileInfo(relative);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });

  const body = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  return new Response(body, {
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(info.size),
      "Cache-Control": "no-store",
    },
  });
}
