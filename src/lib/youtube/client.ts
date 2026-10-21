import { google } from "googleapis";

export function youtubeClient() {
  const id = process.env.YOUTUBE_OAUTH_CLIENT_ID;
  const secret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
  const refresh = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!id || !secret || !refresh) {
    throw new Error("Thiếu YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN: chạy `npm run youtube:auth`");
  }
  const auth = new google.auth.OAuth2(id, secret);
  auth.setCredentials({ refresh_token: refresh });
  return google.youtube({ version: "v3", auth });
}

type GoogleError = {
  code?: number | string;
  message?: string;
  errors?: { reason?: string }[];
  response?: { status?: number; data?: { error?: string | { errors?: { reason?: string }[]; message?: string } } };
};

// Phân loại lỗi googleapis. Hình dạng lỗi được xác nhận bằng thử nghiệm ở Task 2 bước 5; cập nhật ở đây nếu khác.
export function classifyYoutubeError(error: unknown): { kind: "quota" | "auth" | "invalid" | "other"; message: string } {
  const e = (error ?? {}) as GoogleError;
  const data = e.response?.data?.error;
  const reasons = [
    ...(e.errors ?? []).map((x) => x.reason),
    ...(typeof data === "object" ? (data?.errors ?? []).map((x) => x.reason) : []),
  ].filter(Boolean) as string[];
  const text = `${e.message ?? ""} ${typeof data === "string" ? data : (data?.message ?? "")}`;
  const message = (e.message ?? String(error)).slice(0, 500);

  if (typeof data === "string" ? data === "invalid_grant" : /invalid_grant/.test(text)) {
    return { kind: "auth", message: "Refresh token hỏng hoặc hết hạn (7 ngày khi project ở Testing). Chạy lại `npm run youtube:auth`." };
  }
  if (reasons.some((r) => r === "quotaExceeded" || r === "uploadLimitExceeded" || r === "dailyLimitExceeded" || r === "rateLimitExceeded")) {
    return { kind: "quota", message };
  }
  if (reasons.some((r) => /^invalid/.test(r) || r === "badRequest" || r === "mediaBodyRequired")) return { kind: "invalid", message };
  return { kind: "other", message };
}
