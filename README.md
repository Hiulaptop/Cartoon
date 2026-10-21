# Cartoon

Quy trình làm phim hoạt hình 2D tiếng Anh cho YouTube, 7 bước từ asset tới upload. Thiết kế: `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md`.

Next.js 15 · shadcn/ui · Tailwind CSS v4 · Postgres trên Supabase (Drizzle ORM, hàng đợi pgmq) · worker Node · 9router.

## Thành phần

| Service | Vai trò |
|---|---|
| `app` | Giao diện Next.js, chỉ nghe `127.0.0.1:3000` (chưa có đăng nhập) |
| `worker` | Lấy job từ hàng đợi pgmq và xử lý (gọi 9router, ghi file) |
| `migrate` | Áp dụng migration DB rồi thoát |

App và worker dùng chung thư mục `./data` (ảnh, video; không commit).

## Cấu hình

1. Tạo `.env` từ mẫu: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`).
2. Điền:
   - `DATABASE_URL`: Supabase dashboard → **Connect** → **Session pooler** (cổng 5432), chuỗi `postgresql://...` đã thay mật khẩu DB. Không phải Project URL `https://<ref>.supabase.co`.
   - `DATABASE_CA_CERT`: kết nối Postgres luôn dùng TLS có xác minh, và chứng chỉ của Supabase **không** có trong kho CA hệ thống. Tải CA cert ở Supabase **Database Settings → SSL Configuration**, lưu thành `certs/supabase-ca.crt`, đặt `DATABASE_CA_CERT=certs/supabase-ca.crt`.
   - `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY`: 9router (URL thường kết thúc bằng `/v1`).
   - `LLM_WRITER_MODEL`, `LLM_JUDGE_MODEL`, `IMAGE_MODEL`: tên model trên 9router; giám khảo phải khác họ với model viết. Model có trong danh sách của router vẫn có thể bị nhà cung cấp trả 404: kiểm tra bằng nút **Kiểm tra 9router**.

Mọi biến đều đọc lúc chạy: sửa `.env` xong chỉ cần `docker compose up -d`.

## Chạy bằng Docker

```bash
docker compose up -d --build
```

Mở http://127.0.0.1:3000 → **Tổng quan** → bấm **Ping worker**; trang **Jobs** phải có `system.ping` ở trạng thái `succeeded`. Cổng 3000 đã bị chiếm thì đặt `APP_PORT` khác trong `.env`.

Dừng: `docker compose down`.

Trên host Linux, worker chạy bằng user `node` (uid 1000) nên thư mục `./data` phải ghi được bởi uid này.

## Phát triển không dùng Docker

```bash
npm install
npm run db:migrate          # áp dụng migration lên DB trong .env
npm run dev                 # http://127.0.0.1:3000 (chỉ nghe 127.0.0.1)
npm run worker              # terminal khác
npm run job -- system.ping  # đẩy job từ dòng lệnh
```

Đổi schema: sửa `src/lib/db/schema.ts` → `npm run db:generate` → xem lại SQL mới trong `drizzle/` → `npm run db:migrate`. Theo `AGENTS.md` luật 3, mọi thay đổi schema cần spec và được duyệt trước.

## Cấu trúc chính

| Đường dẫn | Mô tả |
|---|---|
| `src/app/` | Trang (Tổng quan, Jobs) và server action |
| `src/lib/db/` | Schema Drizzle, kết nối Postgres (TLS), chạy migration |
| `src/lib/queue/` | Đẩy và đọc job (pgmq) |
| `src/lib/storage/` | Đọc ghi file trong `DATA_DIR` |
| `src/lib/ninerouter/` | Client 9router (chat, sinh ảnh) |
| `src/lib/assets/` | Bước 1: chuẩn tên asset, tách nền ảnh, prompt |
| `src/lib/scene/`, `src/remotion/` | Khuôn JSON cảnh, kiểm tra, component dựng hình |
| `src/lib/script/` | Bước 2: khuôn kịch bản, combo, kiểm tra lớp 1 |
| `src/lib/pipeline/steps.ts` | 7 bước quy trình, dùng cho menu và trang Tổng quan |
| `src/worker/` | Tiến trình worker và handler từng loại job |
| `drizzle/` | File migration SQL (commit vào repo) |
| `scripts/spikes/` | Code thử nghiệm M0, không dùng trong app |
