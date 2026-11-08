import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { dataFileInfo, dataPath } from "@/lib/storage";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".json": "application/json",
};

// Trả file trong DATA_DIR cho trình duyệt (ảnh asset...). dataPath() chặn đường dẫn thoát ra ngoài.
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const relative = (await params).path.join("/");
  let full: string;
  try {
    full = dataPath(relative);
    const normalized = path.relative(dataPath("."), full).split(path.sep)[0].toLowerCase().replace(/[. ]+$/g, "");
    if (normalized === "automation") return new Response("Not found", { status: 404 });
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const info = await dataFileInfo(relative);
  if (!info?.isFile()) return new Response("Not found", { status: 404 });

  const size = info.size;
  const type = CONTENT_TYPES[path.extname(full).toLowerCase()] ?? "application/octet-stream";
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  // Trình duyệt cần Range để tua MP4.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");

  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...base, "Content-Range": `bytes */${size}` } });
    }
    const part = Readable.toWeb(createReadStream(full, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(part, {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(createReadStream(full)) as ReadableStream<Uint8Array>;
  return new Response(body, { headers: { ...base, "Content-Length": String(size) } });
}
