// Lấy refresh token YouTube (luồng loopback cho OAuth client loại Desktop) và ghi vào .env.
// Chạy: npm run youtube:auth. Token KHÔNG được in ra màn hình.
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import { google } from "googleapis";

const id = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const secret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
if (!id || !secret) throw new Error("Thiếu YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET trong .env");

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
// state ràng buộc callback với đúng lần yêu cầu này (chống CSRF / chèn code từ nơi khác).
const STATE = randomBytes(16).toString("hex");

const oauth2 = new google.auth.OAuth2(id, secret, REDIRECT);
const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/youtube.upload"],
  state: STATE,
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
      if (u.searchParams.get("state") !== STATE) {
        // Không phải callback của lần đăng nhập này: bỏ qua, tiếp tục chờ.
        res.statusCode = 400;
        res.end("Sai state, bỏ qua.");
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

// Ghi YOUTUBE_REFRESH_TOKEN và YOUTUBE_TOKEN_ISSUED_AT vào .env, giữ nguyên các dòng khác.
// .env có thể không kết thúc bằng xuống dòng (lỗi đã gặp ở M1), nên chèn "\n" trước khi thêm.
const envPath = new URL("../.env", import.meta.url);
let env = await readFile(envPath, "utf8");
const put = (key, value) => {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env}${env.endsWith("\n") || env === "" ? "" : "\n"}${line}\n`;
};
put("YOUTUBE_REFRESH_TOKEN", tokens.refresh_token);
put("YOUTUBE_TOKEN_ISSUED_AT", new Date().toISOString());
await writeFile(envPath, env);
console.log("Đã ghi YOUTUBE_REFRESH_TOKEN và YOUTUBE_TOKEN_ISSUED_AT vào .env (token không được in ra).");
