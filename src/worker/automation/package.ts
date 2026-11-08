import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import tar from "tar-stream";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { automationOutputs, automationVideos } from "@/lib/db/schema";
import { BundleSchema } from "@/lib/automation/contracts";
import { canonicalHash } from "@/lib/automation/fingerprint";
import { inspectFile, verifyFiles } from "@/lib/automation/files";
import { isApproved } from "@/lib/automation/workflow";
import { dataPath } from "@/lib/storage";
import type { JobHandler } from "../job-types";
import { guardJob, publishArtifact } from "./run-guard";

export const packageAutomationVideo: JobHandler = (payload, ctx) => guardJob(payload, ctx, async (context) => {
  const final = await getDb().transaction(async (tx) => {
    const [video] = await tx.select().from(automationVideos).where(eq(automationVideos.id, context.video.id));
    const [output] = video?.outputId ? await tx.select().from(automationOutputs).where(and(eq(automationOutputs.id, video.outputId), eq(automationOutputs.videoId, video.id))) : [];
    if (!output?.hash || output.kind !== "render" || output.status !== "ready" || canonicalHash(output.manifest) !== output.hash || !await isApproved(tx, video.id, 3, output.id, output.hash)) throw new Error("Không có bản cuối hiện hành đã duyệt");
    return output;
  });
  const bundle = BundleSchema.parse(final.manifest);
  await verifyFiles(bundle.files);
  const outputId = randomUUID();
  const relative = `automation/public/${outputId}`;
  await mkdir(dataPath(relative), { recursive: true });
  const target = `${relative}/export.tar.gz`;
  const temporary = `${target}.tmp`;
  const pack = tar.pack();
  const archivePromise = pipeline(pack, createGzip(), createWriteStream(dataPath(temporary)));
  // Keep rejection handled while serially feeding entries.
  void archivePromise.catch(() => undefined);
  try {
    for (const file of bundle.files) {
      await ctx.extendLock(300);
      if (!/^[a-z0-9.-]+$/.test(file.name)) throw new Error("Tên entry không hợp lệ");
      await pipeline(createReadStream(dataPath(file.path)), pack.entry({ name: file.name, size: file.bytes, type: "file", mode: 0o644 }));
    }
    pack.finalize();
    await archivePromise;
    await verifyFiles(bundle.files);
    await rename(dataPath(temporary), dataPath(target));
    const file = await inspectFile(`archive-${outputId}`, "export.tar.gz", target, "application/gzip");
    await publishArtifact(context, "package", { version: 1, finalOutputId: final.id, finalHash: final.hash, files: [file] }, { finalOutputId: final.id, finalHash: final.hash });
  } catch (error) { pack.destroy(); await archivePromise.catch(() => undefined); throw error; }
});
