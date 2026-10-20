# M0 spikes (code bỏ đi)

Code trong thư mục này chỉ để trả lời các câu hỏi rủi ro của M0. **Không dùng lại trong app.** Kết luận nằm ở `docs/superpowers/spikes/2026-10-21-m0-findings.md`.

Chạy từ gốc repo để `--env-file` đọc được `.env`:

```bash
node --env-file=.env scripts/spikes/m0/<script>.mjs
```

Biến cần có trong `.env` (không commit):

| Biến | Dùng cho |
|---|---|
| `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY` | image-probe |
| `DATABASE_URL` | db-probe (Supabase, session pooler cổng 5432) |
| `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` | youtube-auth, youtube-upload |

Đầu ra ghi vào `data/spikes/m0/` (gitignored).
