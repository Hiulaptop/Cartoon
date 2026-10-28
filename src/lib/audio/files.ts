import { mkdir, writeFile, rename, unlink, readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataPath } from "@/lib/storage";
import { sha256 } from "./fingerprint";
import type { AudioSourceMeta } from "./types";

export async function storeTakeAudio(takeId: string, bytes: Uint8Array, meta: Omit<AudioSourceMeta, "filePath" | "sha256">): Promise<AudioSourceMeta> {
  if (!/^[a-f0-9-]{36}$/i.test(takeId)) throw new Error("ID bản thu không hợp lệ");
  const dir = dataPath(`audio/takes/${takeId}`);
  await mkdir(dir, { recursive: true });
  // An exclusive marker reserves this take forever; retries cannot replace its source.
  const marker = path.join(dir, "source.claim");
  await writeFile(marker, "immutable take\n", { flag: "wx" });
  const filePath = `audio/takes/${takeId}/source.${meta.codec === "mp3" ? "mp3" : "wav"}`;
  const temporary = path.join(dir, `${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await rename(temporary, dataPath(filePath));
  } finally { await unlink(temporary).catch(() => undefined); }
  return { ...meta, filePath, sha256: sha256(bytes) };
}
export async function verifyAudioSource(meta: AudioSourceMeta): Promise<void> {
  const bytes = await readFile(dataPath(meta.filePath));
  if (bytes.length !== meta.bytes || sha256(bytes) !== meta.sha256) throw new Error("File audio đã thay đổi hoặc bị hỏng");
}
export async function readBoundedAudio(stream: ReadableStream<Uint8Array>, limit = 25 * 1024 * 1024): Promise<Uint8Array> {
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error("Audio vượt 25 MiB"); }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size);
  } finally { reader.releaseLock(); }
}
