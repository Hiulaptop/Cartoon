# M0 spikes (code bỏ đi)

Code trong thư mục này chỉ để trả lời các câu hỏi rủi ro của M0. **Không dùng lại trong app.** Kết luận nằm ở `docs/superpowers/spikes/2026-10-21-m0-findings.md`.

Đây là project riêng: app không type-check, lint trong Docker hay đóng gói thư mục `scripts/`. Cài dependency trước khi chạy:

```bash
npm install --prefix scripts/spikes/m0
```

Chạy từ gốc repo để `--env-file` đọc được `.env`:

```bash
node --env-file=.env scripts/spikes/m0/<script>.mjs
```

Biến cần có trong `.env` (không commit; mẫu ở `.env.example`):

| Biến | Dùng cho |
|---|---|
| `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY` | image-probe |
| `IMAGE_MODEL` (tùy chọn) | image-probe, mặc định `ag/gemini-3.1-flash-image` |
| `DATABASE_URL` | db-probe (Supabase, session pooler cổng 5432) |
| `DATABASE_CA_CERT` (tùy chọn) | db-probe: file CA cert của Supabase. Bỏ trống thì xác minh TLS bằng kho CA hệ thống. |
| `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` | youtube-auth, youtube-upload |

Đầu ra ghi vào `data/spikes/m0/` (gitignored).

## Render Remotion (phép thử c)

`remotion/` là project riêng nữa, chạy trong Docker:

```bash
npm install --prefix scripts/spikes/m0/remotion
cp data/spikes/m0/a2-greenscreen-keyed.png scripts/spikes/m0/remotion/public/chr.png
docker build -t cartoon-m0-remotion scripts/spikes/m0/remotion
MSYS_NO_PATHCONV=1 docker run --rm -v "D:/cartoon/data/spikes/m0:/out" cartoon-m0-remotion
```

- `public/chr.png` là ảnh nhân vật đã tách nền (gitignored), phải có trước khi build.
- Lệnh `docker run` trên dùng cho Git Bash trên Windows; đổi đường dẫn mount theo máy của bạn.
