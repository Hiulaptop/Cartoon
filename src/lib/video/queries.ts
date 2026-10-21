import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { scripts, validations, videos } from "@/lib/db/schema";

export type Video = typeof videos.$inferSelect;
export type ScriptRow = typeof scripts.$inferSelect;
export type Validation = typeof validations.$inferSelect;

export async function listVideos() {
  return getDb().select().from(videos).orderBy(desc(videos.createdAt));
}

export async function getVideo(id: string) {
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, id)).limit(1);
  if (!video) return null;
  const versions = await db.select().from(scripts).where(eq(scripts.videoId, id)).orderBy(desc(scripts.version));
  const checks = versions.length
    ? await db
        .select()
        .from(validations)
        .where(inArray(validations.targetId, versions.map((v) => v.id)))
        .orderBy(desc(validations.createdAt))
    : [];
  return { video, versions, checks };
}
