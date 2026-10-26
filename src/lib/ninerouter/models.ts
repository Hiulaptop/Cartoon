// Danh sách model chat của 9router (GET /models). Dùng chung app + worker nên không import "server-only".

export type ChatModelInfo = { id: string; owner: string; contextLength: number | null; maxOutput: number | null; reasoning: boolean };

type RawModel = {
  id?: unknown;
  owned_by?: unknown;
  context_length?: unknown;
  max_completion_tokens?: unknown;
  capabilities?: { imageOutput?: unknown; reasoning?: unknown };
};

const CACHE_MS = 5 * 60_000;
let cache: { at: number; models: ChatModelInfo[] } | null = null;

export async function listChatModels(): Promise<{ models: ChatModelInfo[]; fetchedAt: string }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return { models: cache.models, fetchedAt: new Date(cache.at).toISOString() };
  const baseUrl = process.env.NINE_ROUTER_BASE_URL;
  const apiKey = process.env.NINE_ROUTER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Thiếu NINE_ROUTER_BASE_URL hoặc NINE_ROUTER_API_KEY");
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!response.ok) throw new Error(`9router /models trả lỗi ${response.status}`);
  const body = (await response.json()) as { data?: RawModel[] };
  if (!Array.isArray(body.data)) throw new Error("9router /models trả dữ liệu không đúng dạng");
  const models = body.data
    .filter((item): item is RawModel & { id: string } => typeof item.id === "string" && item.id.length > 0 && item.capabilities?.imageOutput !== true)
    .map((item) => ({
      id: item.id,
      owner: typeof item.owned_by === "string" ? item.owned_by : "",
      contextLength: typeof item.context_length === "number" ? item.context_length : null,
      maxOutput: typeof item.max_completion_tokens === "number" ? item.max_completion_tokens : null,
      reasoning: item.capabilities?.reasoning === true,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  cache = { at: Date.now(), models };
  return { models, fetchedAt: new Date(cache.at).toISOString() };
}

// Ném lỗi tiếng Việt nếu model không có trong danh sách của router; không bao giờ âm thầm dùng model khác.
export async function assertKnownModel(id: string): Promise<void> {
  const { models } = await listChatModels();
  if (!models.some((model) => model.id === id)) throw new Error(`Model "${id.slice(0, 80)}" không có trong danh sách của 9router; tải lại danh sách và chọn lại`);
}
