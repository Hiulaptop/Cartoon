import { z } from "zod";
import { readBoundedAudio } from "@/lib/audio/files";

export type TtsVoiceOption = { id: string; label: string; wireModelId: string };
export type TtsModelOption = { id: string; label: string; maxCharacters?: number; requiresVoice: boolean; voices: TtsVoiceOption[]; unavailable?: string };
function config() {
  const base = process.env.NINE_ROUTER_BASE_URL?.replace(/\/+$/, "");
  const key = process.env.NINE_ROUTER_API_KEY;
  if (!base || !key) throw new Error("Thiếu cấu hình 9router");
  return { base, key };
}
async function getJson(url: string): Promise<unknown> {
  const { base, key } = config();
  const target = new URL(url, `${base}/`);
  const root = new URL(base);
  if (target.origin !== root.origin || !target.pathname.startsWith(`${root.pathname.replace(/\/$/, "")}/`)) throw new Error("Metadata URL ngoài router");
  const response = await fetch(target, { headers: { Authorization: `Bearer ${key}` }, redirect: "error", signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`9router metadata HTTP ${response.status}`);
  return response.json();
}
const infoSchema = z.object({ id: z.string(), kind: z.string(), name: z.string().optional(), voicesUrl: z.string().optional() });
const modelsSchema = z.object({ data: z.array(z.object({ id: z.string(), name: z.string().optional() })) });
export async function getTtsVoices(modelId: string): Promise<TtsVoiceOption[]> {
  const { base } = config();
  const info = infoSchema.parse(await getJson(`${base}/models/info?id=${encodeURIComponent(modelId)}&kind=tts`));
  if (info.kind !== "tts") throw new Error("Model không phải TTS");
  if (!info.voicesUrl) return [];
  const url = new URL(info.voicesUrl, `${base}/`);
  if (!url.pathname.endsWith("/audio/voices")) throw new Error("Voices URL không hỗ trợ");
  const list = z.object({ data: z.array(z.object({ id: z.string(), name: z.string().optional(), model: z.string() })) }).parse(await getJson(url.toString()));
  return list.data.map((voice) => ({ id: voice.id, label: voice.name || voice.id, wireModelId: voice.model }));
}
export async function listTtsModels(): Promise<TtsModelOption[]> {
  const { base } = config();
  const list = modelsSchema.parse(await getJson(`${base}/models/tts`));
  // No provider/voice defaults are guessed. Explicit voice wire IDs come from router.
  return Promise.all(list.data.slice(0, 100).map(async (model): Promise<TtsModelOption> => {
    try {
      const info = infoSchema.parse(await getJson(`${base}/models/info?id=${encodeURIComponent(model.id)}&kind=tts`));
      if (info.kind !== "tts") throw new Error("wrong kind");
      const voices = info.voicesUrl ? await getTtsVoices(model.id) : [];
      return { id: model.id, label: model.name || info.name || model.id, requiresVoice: true, voices, ...(!voices.length ? { unavailable: "Router chưa công bố voice/wire ID rõ ràng cho model này" } : {}) };
    } catch { return { id: model.id, label: model.name || model.id, requiresVoice: true, voices: [], unavailable: "Không đọc được metadata/voice của model" }; }
  }));
}
export async function resolveTtsModel(wireModelId: string) {
  const models = await listTtsModels();
  for (const model of models) {
    const voice = model.voices.find((v) => v.wireModelId === wireModelId);
    if (voice) return { modelId: wireModelId, label: `${model.label} / ${voice.label}`, maxCharacters: Math.min(5000, model.maxCharacters ?? 5000) };
  }
  throw new Error("Model/voice TTS không còn được router công bố; refresh danh sách");
}
export async function synthesizeSpeech(input: { modelId: string; text: string; timeoutMs?: number }): Promise<Uint8Array> {
  const { base, key } = config();
  try {
    const response = await fetch(`${base}/audio/speech?response_format=mp3`, {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: input.modelId, input: input.text }), redirect: "error", signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
    });
    if (!response.ok) throw new Error(`9router TTS HTTP ${response.status}`);
    if (!response.body) throw new Error("9router TTS không có audio");
    return await readBoundedAudio(response.body);
  } catch (error) {
    if (error instanceof Error && /^9router TTS HTTP \d+$/.test(error.message)) throw error;
    throw new Error("TTS không hoàn tất; kết quả upstream chưa chắc chắn, không tự thử lại");
  }
}
