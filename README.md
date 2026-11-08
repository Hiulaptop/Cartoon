# Cartoon

Quy trình làm phim hoạt hình 2D tiếng Anh cho YouTube, 7 bước từ asset tới upload. Thiết kế: `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md`.

Next.js 15 · shadcn/ui · Tailwind CSS v4 · Postgres trên Supabase (Drizzle ORM, hàng đợi pgmq) · worker Node · 9router.

## Automation explainer (độc lập)

Điểm vào `/automation`, luôn hiện trong cả hai mode. Câu hỏi nhập tay → nghiên cứu nguồn thật → cổng 1 → storyboard → preview thật → cổng 2 → audio/render → cổng 3 → `export.tar.gz`. Không upload YouTube. Format 1920×1080, 30 fps, H.264; mục tiêu 4–6 phút, không cắt thoại hoặc ép tốc độ khi vượt thời lượng.

- Migration mới `0015_third_cyclops.sql` và `0016_fantastic_smiling_tiger.sql` chỉ được áp dụng sau khi người vận hành xác nhận đúng DB và các migration đang chờ. Không tự apply khi mở trang. Các migration cũ có thể có thao tác phá dữ liệu; đọc lịch sử trước khi chạy migrate.
- `AUTOMATION_EXECUTION_ENABLED=false` mặc định. Chỉ bật khi đã cấu hình hồ sơ, quyền sử dụng và local/private hoặc kiểm soát truy cập upstream. Đây không phải authentication. **Không bật trên public tunnel không bảo vệ.**
- Hồ sơ snapshot khi tạo tập: model viết chính xác, wire model/voice ID do 9router công bố, hostname nguồn khớp chính xác, ngân sách và xác nhận quyền. Có thể áp dụng hồ sơ mới bằng thao tác tường minh: làm cũ research/storyboard/output và duyệt lại từ đầu. Không điền API key vào hồ sơ. TTS không âm thầm đổi voice/model.
- Giá/cap của router chưa xác minh: ledger ghi `unknown`, không biến số ngân sách thành cam kết hard cap. Mỗi chặng cần consent và số request tối đa riêng; repairs tính vào số này. Timeout/crash không biết upstream đã xử lý chưa sẽ dừng, không tự charge lại. Có form đối soát theo run/operation, yêu cầu ghi căn cứ upstream và xác nhận worker cũ đã dừng; chỉ dùng khi không còn run active. Thao tác giữ lịch sử/chi phí unknown, không phục hồi artifact hoặc tự gửi lại. HTTP 4xx cũng không tự coi là chưa tính tiền.
- Nguồn chỉ HTTPS:443, không redirect/compression/login/PDF/JavaScript, tối đa 6 URL và 2 MiB/nguồn; research chỉ nhận tối đa 12.000 ký tự trích xuất/nguồn (từ chối nguồn dài, không cắt ngầm). Lỗi từng URL được ghi trong run; chỉ dùng nguồn đọc thành công. Snapshot nằm riêng và bị chặn ở `/api/files`; exports không chứa toàn văn bên thứ ba.
- Gói chứa video, phụ đề, thumbnail, metadata, nguồn, manifest và editorial; tải chính thức cần duyệt bản cuối. Preview và các file hiện hành (video, thumbnail, SRT, metadata, nguồn, editorial, manifest) được mở bằng đường review để duyệt, chưa phải gói phát hành đã duyệt. Ngoài 4–6 phút bị chặn trừ khi người vận hành ghi lý do ngoại lệ tường minh cho lượt render. Chưa có auth theo người dùng; đường review không phải cơ chế bảo mật độc lập.
- Cần review nghe/nhìn thật trước sử dụng; static checks không chứng minh kiến thức, chất lượng voice hoặc năng suất. Mục tiêu 1 tập/tuần với 5 giờ người chưa được pilot xác minh. Worker tuần tự; render có thể chặn job khác.

Tài liệu: `docs/superpowers/specs/2026-10-29-automation-explainer-design.md`, `docs/superpowers/plans/2026-10-29-automation-explainer.md`. Chưa chạy pilot có phí hay apply migration trong phiên triển khai.

## ComfyUI asset pilot (chưa nghiệm thu runtime)

App có adapter/worker riêng cho sinh biến thể asset hiện có bằng ComfyUI, vẫn giữ hậu xử lý và duyệt ảnh cũ. `COMFYUI_ENABLED=false`, registry chưa có workflow/model release thật nên chưa thể sinh bằng ComfyUI; 9router vẫn mặc định, không fallback ngầm. Model/workflow được setup trong ComfyUI rồi export API format và review để phát hành.

Migration `0017_puzzling_caretaker.sql` **chỉ được sinh, chưa apply**; rollout phải rà cả pending Automation 0015/0016 và thay worker cũ trước enqueue. Code mới cần bảng này kể cả khi flag tắt. Không tự bật config/network hoặc chạy GPU khi deploy. Run mơ hồ giữ để đối soát; resume dùng prompt ID cũ, không POST mới. Hướng dẫn đầy đủ và các cổng còn thiếu: [docs/comfyui-pilot.md](docs/comfyui-pilot.md).

## Kích thước khi tạo asset

Form tạo asset có **Kích thước yêu cầu**: Mặc định model, 1024×1024, 1920×1080, 1080×1920, 1536×1024 và 1024×1536. Lựa chọn lưu theo asset, các biến thể/retry kế thừa; V1 không đổi preset sau tạo. Asset cũ giữ Mặc định model.

Trang asset phân biệt ảnh nguồn model thực trả và PNG sau tách nền/trim; khi nguồn khác preset sẽ có cảnh báo. Không resize để giả kích thước yêu cầu. Với Antigravity (`ag/`), preset ngang1920×1080 gửi wire1792x1024, dọc1080×1920 gửi1024x1792 để chọn tỷ lệ theo9router0.5.104; không cam kết pixel native. Jobs metrics ghi requestedSize, transportSize, sourceWidth/sourceHeight và width/height PNG. Mặc định model bỏ hẳn size trong request.

## Chạy local với Supabase riêng

Yêu cầu Docker Desktop đang chạy Linux containers và Node.js 22 trở lên. Supabase CLI 2.121.0 đã pin trong devDependencies; bản hiện tại dùng Next.js 15.5.28, React 19.1.0, image Node 22 và Supabase Postgres 17. Không cần tài khoản Supabase Cloud hoặc mật khẩu DB của teammate.

```powershell
npm ci
npm run db:local:start
docker compose -f docker-compose.yml -f docker-compose.local.yml build
docker compose -f docker-compose.yml -f docker-compose.local.yml up --no-deps --exit-code-from migrate migrate
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --no-deps app worker
```

Mở app tại http://127.0.0.1:3000 và Supabase Studio tại http://127.0.0.1:54323. Chọn **Ping worker** ở Tổng quan rồi xem Jobs để xác nhận app, DB và worker hoạt động.

`db:local:start` tạo network `cartoon-local` chỉ publish loopback, khởi động Supabase project `cartoon-local` và điền cấu hình local vào `.env` (backup trong `.superpowers/local-db/`). Các giá trị 9router được giữ nguyên; nếu `.env` đang trỏ DB khác thì helper từ chối ghi đè. Lần đầu cần tải các image Docker nên có thể mất vài phút.

Helper ép port về `127.0.0.1` ngay khi CLI tạo container qua một proxy Docker API tạm thời dùng named pipe riêng trên Windows (Unix socket trong thư mục chỉ user được truy cập trên Linux/macOS), rồi kiểm tra lại actual bindings. Proxy không mở cổng TCP, chỉ hoạt động lúc start và không thay cấu hình Docker daemon.

Analytics/Logflare được tắt vì Vector của CLI trên Windows yêu cầu Docker TCP API. Studio vẫn quản lý database; xem log app/worker bằng `docker compose logs app worker`.

- Trên Windows: `DATABASE_URL` dùng `127.0.0.1:54322`.
- Trong Docker: override dùng `LOCAL_DATABASE_URL` trỏ `supabase_db_cartoon-local:5432` qua network chung.
- `DATABASE_SSL_MODE=disable` chỉ cho phép hostname local của Cartoon. Cloud mặc định `verify-full`; khi chuyển lại Cloud phải đổi mode và CA cert tương ứng.
- Drizzle là nguồn migration duy nhất cho ứng dụng. Không dùng Supabase reset/push để chạy lại SQL Drizzle. Migration `0002` xóa dữ liệu nghiệp vụ nếu chưa áp dụng; chỉ chạy sau khi xác nhận đúng DB local mới, hoặc đã xử lý backup cho dữ liệu cũ.

Kiểm tra trạng thái bằng `npm run db:local:status` (không in credentials). Dừng app/worker và Supabase bằng `npm run db:local:stop`; dữ liệu được giữ lại. Để chạy lại: `npm run db:local:start`, rồi lệnh `up -d --no-deps app worker` ở trên. Không dùng `--no-backup` hoặc xóa Docker volume nếu muốn giữ dữ liệu.

Nguồn cấu hình: [Supabase local development](https://supabase.com/docs/guides/local-development/cli/getting-started), [Node IPC](https://nodejs.org/api/net.html#ipc-support), [Node dotenv](https://nodejs.org/api/environment_variables.html), [pg SSL](https://node-postgres.com/features/ssl), [Next.js memory usage](https://nextjs.org/docs/15/app/guides/memory-usage).

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
3. **Bản thiết kế** (`/designs/<id>`): chọn bộ phim (chỉ bộ phim có ít nhất 1 nhân vật và 1 bối cảnh đã duyệt). Tab **Casting**: AI đề xuất asset mới và biến thể còn thiếu, ảnh được sinh tự động; bạn duyệt, loại (sinh lại) hoặc bỏ từng đề xuất, xong hết mới bấm "Viết kịch bản". Sau đó làm lần lượt các tab Kịch bản, Phân cảnh và cảnh, Ghép video, Upload.
4. **Sân thử JSON cảnh** (`/scenes/playground`): chọn bộ phim rồi thử khuôn JSON cảnh.
