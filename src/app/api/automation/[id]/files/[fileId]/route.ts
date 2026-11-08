import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { z } from "zod";
import { resolveAutomationFile } from "@/lib/automation/files";
import { dataPath } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  if (!z.uuid().safeParse(id).success || !/^[a-zA-Z0-9_-]{1,60}$/.test(fileId)) return new Response(null, { status: 404 });
  try {
    const file = await resolveAutomationFile(id, fileId, new URL(request.url).searchParams.get("review") === "1");
    if (!file) return new Response(null, { status: 404 });
    const headers = { "Content-Type": file.mime, "Cache-Control": "no-store", "Accept-Ranges": "bytes", "Content-Disposition": `inline; filename="${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}"`, "X-Content-Type-Options": "nosniff" };
    const range = request.headers.get("range");
    let start = 0, end = file.bytes - 1;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${file.bytes}` } });
      start = match[1] ? Number(match[1]) : Math.max(0, file.bytes - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.bytes || (!match[1] && Number(match[2]) <= 0)) return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${file.bytes}` } });
    }
    const body = Readable.toWeb(createReadStream(dataPath(file.path), { start, end })) as ReadableStream<Uint8Array>;
    return new Response(body, { status: range ? 206 : 200, headers: { ...headers, "Content-Length": String(end - start + 1), ...(range ? { "Content-Range": `bytes ${start}-${end}/${file.bytes}` } : {}) } });
  } catch { return new Response(null, { status: 404 }); }
}
