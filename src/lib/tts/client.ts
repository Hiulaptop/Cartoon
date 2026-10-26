// Client kết nối tới microservice VieNeu-TTS local (chạy trên port 8080 mặc định).
// Fallback an toàn nếu service chưa bật.

export type TTSVoice = {
  id: string;
  label: string;
  is_south: boolean;
  gender: "male" | "female";
};

export const DEFAULT_TTS_URL = process.env.LOCAL_TTS_URL || "http://127.0.0.1:8080";

// Preset danh sách giọng miền Nam đề xuất
export const PRESET_SOUTH_VOICES: readonly TTSVoice[] = [
  { id: "Adam", label: "Adam — Nam · Nam · Tự nhiên (Mặc định)", is_south: true, gender: "male" },
  { id: "Minh Triết", label: "Minh Triết — Nam · Nam · Tin tức", is_south: true, gender: "male" },
  { id: "Thái Sơn", label: "Thái Sơn — Nam · Nam · Kể chuyện", is_south: true, gender: "male" },
  { id: "Đức Trí", label: "Đức Trí — Nam · Nam · Đọc truyện", is_south: true, gender: "male" },
  { id: "Thùy Dung", label: "⭐ Thùy Dung — Nữ · Nam · Tin tức", is_south: true, gender: "female" },
  { id: "Thục Đoan", label: "Thục Đoan — Nữ · Nam · Kể chuyện", is_south: true, gender: "female" },
  { id: "Mỹ Duyên", label: "Mỹ Duyên — Nữ · Nam · Đọc truyện", is_south: true, gender: "female" },
  { id: "Kim Thanh", label: "Kim Thanh — Nữ · Nam · Đọc truyện", is_south: true, gender: "female" },
];

export async function checkTTSHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${DEFAULT_TTS_URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchTTSVoices(): Promise<TTSVoice[]> {
  try {
    const res = await fetch(`${DEFAULT_TTS_URL}/voices`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [...PRESET_SOUTH_VOICES];
    const data = (await res.json()) as { voices?: TTSVoice[] };
    return data.voices && data.voices.length > 0 ? data.voices : [...PRESET_SOUTH_VOICES];
  } catch {
    return [...PRESET_SOUTH_VOICES];
  }
}

export async function synthesizeTTS(params: {
  text: string;
  voice: string;
  speed: number;
  temperature?: number;
}): Promise<{ ok: boolean; audioBuffer?: Buffer; error?: string; genSeconds?: number; status?: number }> {
  try {
    const res = await fetch(`${DEFAULT_TTS_URL}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(60_000), // Cho phép tối đa 60s
    });

    if (!res.ok) {
      const err = await res.text();
      // `status` cho người gọi phân biệt lỗi của yêu cầu (4xx, vd giọng sai: không nên thử lại) với lỗi hạ tầng (5xx hoặc không kết nối).
      return { ok: false, status: res.status, error: `TTS Service lỗi ${res.status}: ${err}` };
    }

    const arrayBuf = await res.arrayBuffer();
    const genSec = parseFloat(res.headers.get("X-Generation-Time") || "0");
    return { ok: true, audioBuffer: Buffer.from(arrayBuf), genSeconds: genSec };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không kết nối được TTS service local (127.0.0.1:8080)",
    };
  }
}
