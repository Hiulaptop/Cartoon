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

## Render (M6)

Image worker có Chrome Headless Shell cho Remotion nên lớn hơn (khoảng 1.8 GB) và lần `docker compose build` đầu lâu hơn.

## Upload YouTube (M7)

1. Trên Google Cloud Console: bật **YouTube Data API v3**, tạo màn hình đồng ý OAuth loại External ở trạng thái **Testing** và thêm tài khoản chủ kênh làm test user, rồi tạo OAuth client loại **Desktop app**.
2. Điền `YOUTUBE_OAUTH_CLIENT_ID` và `YOUTUBE_OAUTH_CLIENT_SECRET` vào `.env`.
3. Chạy `npm run youtube:auth`, đăng nhập tài khoản chủ kênh và cho phép. Lệnh tự ghi `YOUTUBE_REFRESH_TOKEN` vào `.env` (không in ra).
4. Project ở trạng thái Testing thì refresh token **hết hạn sau 7 ngày**: chạy lại bước 3 mỗi tuần. Tab Upload của mỗi bản thiết kế cảnh báo từ ngày thứ 6.
5. Video mặc định upload ở chế độ riêng tư; muốn công khai phải tick ô xác nhận trên trang upload.

## Publish qua cartoon.studev.net (Cloudflare Tunnel)

Hai chế độ, chọn bằng `COMPOSE_PROFILES` trong `.env`:

| Chế độ | `.env` | `docker compose up -d` |
|---|---|---|
| Dev (mặc định) | `COMPOSE_PROFILES=` | Chỉ chạy migrate, app, worker. App chỉ mở ở `127.0.0.1`. |
| Publish | `COMPOSE_PROFILES=publish` | Chạy thêm service `tunnel` (cloudflared) đưa app ra `https://cartoon.studev.net`. |

Cài đặt một lần:
1. Cloudflare Zero Trust > Networks > Tunnels: tạo tunnel kiểu cloudflared (remotely-managed), chép token vào `TUNNEL_TOKEN` trong `.env`.
2. Trong tunnel, thêm **Public hostname**: `cartoon.studev.net`, service `HTTP` `app:3000` (tên service trong mạng compose).
3. Đặt `COMPOSE_PROFILES=publish` rồi `docker compose up -d`. Muốn tắt tunnel: đặt lại rỗng và `docker compose up -d --remove-orphans`.

**Cảnh báo:** app không có đăng nhập. Khi publish, bất kỳ ai biết URL đều tạo được asset (tốn credit model), duyệt nội dung và upload lên kênh YouTube đã kết nối. Nên đặt Cloudflare Access trước hostname này, hoặc chỉ bật publish khi cần.

## Cách dùng (bộ phim, project, bản thiết kế)

1. **Bộ phim** (`/series`): tạo bộ phim, rồi tạo và duyệt nhân vật, bối cảnh, đạo cụ của bộ phim đó (bước 1).
2. **Project** (`/projects`): thư mục lồng nhau tùy ý; trong một project bấm **Tạo bản thiết kế**.
3. **Bản thiết kế** (`/designs/<id>`): chọn bộ phim (chỉ bộ phim có ít nhất 1 nhân vật và 1 bối cảnh đã duyệt), rồi làm lần lượt các tab Kịch bản, Phân cảnh và cảnh, Ghép video, Upload.
4. **Sân thử JSON cảnh** (`/scenes/playground`): chọn bộ phim rồi thử khuôn JSON cảnh.
