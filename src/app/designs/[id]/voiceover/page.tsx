import { notFound } from "next/navigation";
import { z } from "zod";
import { getVoiceoverEditor } from "@/lib/audio/queries";
import { VoiceoverEditor } from "@/components/audio/voiceover-editor";

export const dynamic = "force-dynamic";
export default async function VoiceoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const data = await getVoiceoverEditor(id);
  if (!data) notFound();
  return <><h1 className="text-xl font-semibold">Lồng tiếng</h1><VoiceoverEditor data={data} /></>;
}
