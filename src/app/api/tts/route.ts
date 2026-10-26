import { NextResponse } from "next/server";
import { synthesizeTTS, fetchTTSVoices, checkTTSHealth } from "@/lib/tts/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const isHealthy = await checkTTSHealth();
  const voices = await fetchTTSVoices();
  return NextResponse.json({
    healthy: isHealthy,
    voices,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const voice = typeof body.voice === "string" ? body.voice.trim() : "Adam";
    const speed = typeof body.speed === "number" ? body.speed : 1.25;

    if (!text) {
      return NextResponse.json({ error: "Nội dung văn bản không được để trống" }, { status: 400 });
    }

    const result = await synthesizeTTS({ text, voice, speed });
    if (!result.ok || !result.audioBuffer) {
      // Lỗi 4xx của service (vd giọng sai) giữ nguyên mã; còn lại là lỗi cổng (502).
      const status = result.status !== undefined && result.status >= 400 && result.status < 500 ? result.status : 502;
      return NextResponse.json({ error: result.error || "Lỗi tạo audio TTS" }, { status });
    }

    return new Response(new Uint8Array(result.audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(result.audioBuffer.length),
        "X-Generation-Time": String(result.genSeconds ?? 0),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    );
  }
}
