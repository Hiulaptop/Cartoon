import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { automationOutputs, automationVideos } from "@/lib/db/schema";
import { dataFileInfo, dataPath } from "@/lib/storage";
import { BundleSchema, FileSchema, type OutputFile } from "./contracts";
import { canonicalHash } from "./fingerprint";
import { isApproved } from "./workflow";

export async function inspectFile(id: string, name: string, relative: string, mime: string): Promise<OutputFile> {
  if (!relative.startsWith("automation/public/") || relative.includes("..") || relative.includes("\\")) throw new Error("File không thuộc vùng output");
  const info = await dataFileInfo(relative);
  if (!info?.isFile() || !info.size) throw new Error("File output thiếu hoặc rỗng");
  const digest = createHash("sha256");
  for await (const bytes of createReadStream(dataPath(relative))) digest.update(bytes);
  return FileSchema.parse({ id, name, path: relative, sha256: digest.digest("hex"), bytes: info.size, mime });
}
export async function verifyFiles(files: OutputFile[]) {
  for (const file of files) {
    const actual = await inspectFile(file.id, file.name, file.path, file.mime);
    if (actual.sha256 !== file.sha256 || actual.bytes !== file.bytes) throw new Error(`Checksum file ${file.name} không khớp`);
  }
}
export async function resolveAutomationFile(videoId: string, fileId: string, review = false): Promise<OutputFile | null> {
  const file = await getDb().transaction(async (tx) => {
    const [video] = await tx.select().from(automationVideos).where(eq(automationVideos.id, videoId));
    if (!video || video.archived) return null;
    const rows = await tx.select().from(automationOutputs).where(and(eq(automationOutputs.videoId, videoId), eq(automationOutputs.status, "ready")));
    for (const output of rows) {
      if (output.id !== video.previewId && output.kind !== "package" && output.id !== video.outputId) continue;
      const manifest = output.kind === "render" ? BundleSchema.parse(output.manifest) : null;
      const raw = output.manifest as { files?: unknown[]; finalOutputId?: string; finalHash?: string };
      const files = manifest?.files ?? (raw.files ?? []).map((item) => FileSchema.parse(item));
      const file = files.find((item) => item.id === fileId);
      if (!file || !output.hash || canonicalHash(output.manifest) !== output.hash) continue;
      if (output.kind !== "preview" && !(review && output.kind === "render" && output.id === video.outputId)) {
        const final = rows.find((item) => item.id === video.outputId && item.kind === "render");
        if (!final?.hash || !await isApproved(tx, video.id, 3, final.id, final.hash)) return null;
        if (output.kind === "package" && (raw.finalOutputId !== final.id || raw.finalHash !== final.hash)) return null;
      }
      return file;
    }
    return null;
  });
  if (!file) return null;
  await verifyDownload(file);
  return file;
}

const verified = new Map<string, Promise<void>>();
async function verifyDownload(file: OutputFile) {
  const info = await dataFileInfo(file.path);
  if (!info?.isFile() || info.size !== file.bytes) throw new Error("File output thiếu hoặc sai kích thước");
  const key = `${file.path}:${file.sha256}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  let pending = verified.get(key);
  if (!pending) {
    pending = verifyFiles([file]);
    verified.set(key, pending);
    if (verified.size > 128) verified.delete(verified.keys().next().value!);
    pending.catch(() => { if (verified.get(key) === pending) verified.delete(key); });
  }
  await pending;
}
