// Trạng thái cấu hình OAuth YouTube (chỉ báo có/thiếu, không bao giờ trả giá trị bí mật).
export type YoutubeStatus = {
  configured: boolean;
  missing: string[];
  tokenAgeDays: number | null;
};

export function youtubeStatus(): YoutubeStatus {
  const required = ["YOUTUBE_OAUTH_CLIENT_ID", "YOUTUBE_OAUTH_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"];
  const missing = required.filter((k) => !process.env[k]);
  const issued = process.env.YOUTUBE_TOKEN_ISSUED_AT ? Date.parse(process.env.YOUTUBE_TOKEN_ISSUED_AT) : NaN;
  const tokenAgeDays = Number.isNaN(issued) ? null : (Date.now() - issued) / 86_400_000;
  return { configured: missing.length === 0, missing, tokenAgeDays };
}
