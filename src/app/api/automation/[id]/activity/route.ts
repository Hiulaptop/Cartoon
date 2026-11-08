import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { automationVideos } from "@/lib/db/schema";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response(null, { status: 404 });
  const [video] = await getDb().select({ version: automationVideos.lockVersion, state: automationVideos.state }).from(automationVideos).where(eq(automationVideos.id, id));
  if (!video) return new Response(null, { status: 404 });
  return Response.json({ signature: `${video.version}:${video.state}` }, { headers: { "Cache-Control": "no-store" } });
}
