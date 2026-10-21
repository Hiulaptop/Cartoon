import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const id = process.env.YOUTUBE_OAUTH_CLIENT_ID;
const secret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET;
if (!id || !secret) throw new Error("Thiếu YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET trong .env");

const OUT = new URL("../../../data/spikes/m0/", import.meta.url);
const { refresh_token } = JSON.parse(await readFile(new URL("youtube-token.json", OUT), "utf8"));
// Đường dẫn truyền vào tính theo thư mục hiện tại; mặc định là probe.mp4 của Task 4.
const video = process.argv[2] ? path.resolve(process.argv[2]) : fileURLToPath(new URL("probe.mp4", OUT));

const oauth2 = new google.auth.OAuth2(id, secret);
oauth2.setCredentials({ refresh_token });
const youtube = google.youtube({ version: "v3", auth: oauth2 });

const started = performance.now();
const res = await youtube.videos.insert({
  part: ["snippet", "status"],
  requestBody: {
    snippet: { title: "M0 probe (private)", description: "Cartoon pipeline M0 upload test.", categoryId: "1" },
    status: { privacyStatus: "private", selfDeclaredMadeForKids: false },
  },
  media: { mimeType: "video/mp4", body: createReadStream(video) },
});
console.log(`upload: ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log(`id=${res.data.id} privacy=${res.data.status?.privacyStatus} madeForKids=${res.data.status?.madeForKids}`);
