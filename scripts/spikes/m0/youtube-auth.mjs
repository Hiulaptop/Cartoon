import http from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { google } from "googleapis";

const id = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const secret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
if (!id || !secret) throw new Error("Thiếu YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET trong .env");

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const OUT = new URL("../../../data/spikes/m0/", import.meta.url);
const TOKEN_FILE = new URL("youtube-token.json", OUT);

const oauth2 = new google.auth.OAuth2(id, secret, REDIRECT);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/youtube.upload"],
});
console.log("Mở URL sau trong trình duyệt, đăng nhập đúng tài khoản kênh rồi cho phép:\n");
console.log(url);

const code = await new Promise((resolve, reject) => {
  const server = http
    .createServer((req, res) => {
      const u = new URL(req.url ?? "/", REDIRECT);
      if (u.pathname !== "/callback") {
        res.end();
        return;
      }
      const c = u.searchParams.get("code");
      res.end(c ? "Xong, quay lại terminal." : "Không nhận được code.");
      server.close();
      if (c) resolve(c);
      else reject(new Error(u.searchParams.get("error") ?? "no code"));
    })
    .listen(PORT, "127.0.0.1");
});

const { tokens } = await oauth2.getToken(code);
if (!tokens.refresh_token) throw new Error("Không nhận được refresh_token (thử thu hồi quyền app rồi chạy lại)");
await mkdir(OUT, { recursive: true });
await writeFile(TOKEN_FILE, JSON.stringify({ refresh_token: tokens.refresh_token, obtained_at: new Date().toISOString() }));
console.log(`Đã lưu refresh token vào ${TOKEN_FILE.pathname}`);
