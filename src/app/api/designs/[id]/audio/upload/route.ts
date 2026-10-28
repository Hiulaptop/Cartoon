import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { audioTakes } from "@/lib/db/schema";
import { createUploadTake } from "@/lib/audio/repository";
import { probeAudio, MAX_AUDIO_BYTES, AUDIO_MIMES } from "@/lib/audio/probe";
import { readBoundedAudio, storeTakeAudio } from "@/lib/audio/files";
import { sha256 } from "@/lib/audio/fingerprint";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let claimed: string | undefined;
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Origin không hợp lệ" }, { status: 403 });
    const videoId = z.uuid().parse((await params).id);
    const requestId = z.uuid().parse(request.headers.get("x-audio-request-id"));
    const label = z.string().trim().min(1).max(120).parse(decodeURIComponent(request.headers.get("x-audio-label") ?? ""));
    const filename = decodeURIComponent(request.headers.get("x-audio-filename") ?? "");
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
    if (!AUDIO_MIMES.includes(mime) || !/\.(mp3|wav)$/i.test(filename) || (/\.mp3$/i.test(filename) !== ["audio/mpeg", "audio/mp3"].includes(mime))) return Response.json({ error: "Chọn file MP3 hoặc WAV PCM với MIME đúng" }, { status: 415 });
    if (Number(request.headers.get("content-length")) > MAX_AUDIO_BYTES) return Response.json({ error: "Audio vượt 25 MiB" }, { status: 413 });
    if (!request.body) return Response.json({ error: "Thiếu audio" }, { status: 422 });
    const bytes = await readBoundedAudio(request.body);
    const result = await createUploadTake({ videoId, requestId, label, bytes: bytes.length, sha256: sha256(bytes) });
    if (!result.created) {
      if (["pending_review", "approved", "rejected"].includes(result.take.status)) return Response.json({ takeId: result.take.id, status: result.take.status });
      return Response.json({ error: "Yêu cầu đang xử lý hoặc đã lỗi; kiểm tra bản thu trước khi tạo yêu cầu mới" }, { status: 409 });
    }
    claimed = result.take.id;
    const meta = await probeAudio(bytes, mime);
    const saved = await storeTakeAudio(claimed, bytes, meta);
    await getDb().update(audioTakes).set({ ...saved, status: "pending_review" }).where(eq(audioTakes.id, claimed));
    return Response.json({ takeId: claimed, status: "pending_review" }, { status: 201 });
  } catch (error) {
    if (claimed) await getDb().update(audioTakes).set({ status: "failed" }).where(eq(audioTakes.id, claimed)).catch(() => undefined);
    const message = error instanceof Error && /^(Audio vượt|Request ID|Không đọc được|Codec không|MIME không|Cần đúng|Audio phải|Đọc metadata)/.test(error.message) ? error.message : "Không thể nhập audio; kiểm tra file và kết nối database";
    return Response.json({ error: message }, { status: message.startsWith("Audio vượt") ? 413 : message.startsWith("Request ID") ? 409 : 422 });
  }
}
