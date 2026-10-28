// Client 9router (OpenAI-compatible). Dùng chung cho app (server) và worker,
// nên không import "server-only": gói đó ném lỗi khi chạy ngoài React Server Components.
import { imageTransportSize } from "./image-size";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type ChatResult = { content: string; model: string; usage: TokenUsage };
export type ImageFormat = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };
export type GeneratedImage = ImageFormat & { data: Buffer; transportSize: string | null };

export class ImageGenerationRequestError extends Error {
  constructor(public readonly status: number) {
    super(`9router image HTTP ${status}: yêu cầu sinh ảnh không thành công`);
    this.name = "ImageGenerationRequestError";
  }
}

function config(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.NINE_ROUTER_BASE_URL;
  const apiKey = process.env.NINE_ROUTER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Thiếu NINE_ROUTER_BASE_URL hoặc NINE_ROUTER_API_KEY");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

export function requireModel(envName: "LLM_WRITER_MODEL" | "LLM_JUDGE_MODEL" | "IMAGE_MODEL"): string {
  const model = process.env[envName];
  if (!model) throw new Error(`Thiếu ${envName} (xem .env.example)`);
  return model;
}

export async function chat(input: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
  });
  if (!res.ok) throw new Error(`9router chat HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("9router chat: phản hồi không có nội dung");
  return {
    content,
    model: json.model ?? input.model,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    },
  };
}

// Router có thể ghi Content-Type sai (M0: ghi image/png cho dữ liệu JPEG), nên đọc định dạng từ magic bytes.
export function sniffImage(buf: Buffer): ImageFormat {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  throw new Error(`Không nhận ra định dạng ảnh (4 byte đầu: ${buf.subarray(0, 4).toString("hex")})`);
}

export async function generateImage(input: {
  model: string;
  prompt: string;
  size?: string;
  timeoutMs?: number;
}): Promise<GeneratedImage> {
  const { baseUrl, apiKey } = config();
  const transportSize = imageTransportSize(input.model, input.size);
  const res = await fetch(`${baseUrl}/images/generations?response_format=binary`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.model, prompt: input.prompt, ...(transportSize ? { size: transportSize } : {}) }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
  });
  if (!res.ok) {
    await res.body?.cancel();
    throw new ImageGenerationRequestError(res.status);
  }
  const data = Buffer.from(await res.arrayBuffer());
  return { data, ...sniffImage(data), transportSize: transportSize ?? null };
}
