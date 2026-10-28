# Supabase local — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Thực hiện trực tiếp theo lệnh user "bắt đầu build local". Không tạo/sửa/chạy test; AGENTS.md luật 4–6 thắng các bước TDD của skill.

**Goal:** Chạy Supabase riêng và Cartoon app/worker trên Docker local, duy trì dữ liệu qua restart.

**Architecture:** CLI Supabase pin 2.121.0 quản lý stack DB/Studio trên bridge network cartoon-local chỉ publish loopback. Compose override nối app/worker/migrate vào mạng đó; URL host và container riêng. Drizzle giữ quyền quản lý migration ứng dụng.

**Tech Stack:** Node 24.21.0 host; Node 22 container; Supabase CLI 2.121.0/Postgres 17; Next.js 15.5.28; pg 8.23.1; Docker 29.7.2; Compose v5.5.1.

**Spec:** docs/superpowers/specs/2026-10-21-local-supabase-design.md.

## Global Constraints

- Chỉ local, không DB/team Cloud, không tunnel, không gọi model hoặc upload.
- Giữ nguyên SQL migrations/schema ứng dụng và các file user chưa tracked.
- Chỉ áp dụng migration vào instance/volume cartoon-local mới tạo trong lượt này; không reset/reuse DB cũ mù.
- Giữ remote TLS verify-full mặc định. disable chỉ chấp nhận loopback hoặc supabase_db_cartoon-local.
- Không viết/chạy test. Lint/build/kiểm tra metadata và system.ping là phương thức xác minh.
- User đã yêu cầu thực thi; không dừng giữa các bước để hỏi lại các thao tác trong phạm vi này.

## Review Focus

- Cấu hình SSL sai/hostname remote với disable phải bị từ chối trước mở pool.
- DB port host và Docker khác nhau; override phải truyền đúng URL cho cả migrate/app/worker.
- CLI không được publish port ra LAN; kiểm tra actual HostIp bằng docker inspect.
- CLI không được tự chạy migration/seed Drizzle hoặc reset dữ liệu khi stop/start.
- Giữ .env/9router và dữ liệu sau restart; không in secrets khi kiểm tra status/log.

### Task 1: Cấu hình local và công cụ vận hành

**Files:** package.json, package-lock.json, supabase/config.toml, supabase/.gitignore, scripts/local-db.mjs, scripts/local-docker.mjs, docker-compose.local.yml, .gitignore, .dockerignore.

**Interfaces:** npm run db:local:start/stop/status; network cartoon-local, DB supabase_db_cartoon-local:5432, host DB 127.0.0.1:54322, Studio 127.0.0.1:54323.

- [x] Kiểm tra tên container/volume/network và ports chưa tồn tại/trùng trước start.
- [x] Cài CLI `npm install --save-dev --save-exact supabase@2.121.0`; expected exit 0, lockfile pin đúng.
- [x] Tạo config bằng CLI init; đặt project_id cartoon-local, major_version 17, không auto seed/migration ứng dụng.
- [x] Viết helper Node quản lý network có host_binding_ipv4=127.0.0.1 và CLI với --network-id cartoon-local; status chỉ in URL local không có credential.
- [x] Tạo Compose override dùng LOCAL_DATABASE_URL và mode disable cho migrate/app/worker, gắn thêm external network.
- [x] Ignore runtime metadata và execution scratch; không ignore supabase/config.toml hay code cần commit.

### Task 2: Kết nối DB local rõ ràng

**Files:** src/lib/db/client.ts, docker-compose.yml, .env.example, README.md; chỉ cập nhật giá trị local cần thiết trong .env đã backup.

**Interfaces:** DATABASE_SSL_MODE=verify-full|disable; mặc định verify-full. DATABASE_URL cho host; LOCAL_DATABASE_URL cho container.

- [x] Validate mode, normalize IPv6 brackets và hostname trước chọn ssl config; disable chỉ với allowlist đã duyệt.
- [x] Giữ ssl CA/hostname verification cho remote; dùng ssl:false khi local disable hợp lệ.
- [x] Truyền mode qua Compose base và cập nhật mẫu env/hướng dẫn; giữ các giá trị 9router.
- [x] `docker compose -f docker-compose.yml -f docker-compose.local.yml config --quiet`: expected exit 0 sau có URL local thật; không in config chứa secrets.

### Task 3: Supabase và migration trên DB mới

**Files:** cấu hình local Task 1; không sửa drizzle/*.sql.

- [x] Start stack bằng helper; expected services healthy, DB port/Studio local.
- [x] Kiểm tra metadata qua docker exec psql: PG17, pgmq có trong pg_available_extensions; public chưa có bảng ứng dụng; inspect network/volume đúng instance mới.
- [x] Backup .env rồi điền URL local tương ứng và DATABASE_SSL_MODE=disable bằng giá trị instance đã xác minh; không in password.
- [x] Build image migrate/worker/app; expected Dockerfile lint và build exit 0.
- [x] Chạy Compose migrate riêng với --no-deps --exit-code-from migrate; expected exit 0 và lịch sử migration đầy đủ.

### Task 4: Chạy và bàn giao

**Files:** không sửa thêm nếu không có lỗi; ghi evidence trong execution ledger.

- [x] Start app/worker bằng Compose local override, --no-deps sau migration thành công.
- [x] Xác minh app healthy, worker running, GET /api/health và các trang /series /projects /jobs trả HTTP thành công.
- [x] Enqueue system.ping bằng tsx trực tiếp trong worker container; expected job succeeded và data/system/last-ping.json tồn tại.
- [x] Restart app/worker và DB theo cách không xóa volume, xác minh job cũ vẫn còn và dịch vụ phục hồi.
- [x] Fresh reviewer đọc diff/spec/plan, không test; xử lý lỗi nghiêm trọng rồi chạy lại kiểm tra phù hợp.
- [x] Bàn giao URL app/Studio, lệnh start/stop/status và giới hạn thực tế.

## Nguồn

Theo nguồn chính thức và Context7 trong spec; API pg SSL đối chiếu https://node-postgres.com/features/ssl. CLI flags/ports đối chiếu https://supabase.com/docs/reference/cli/supabase-start và template tag v2.121.0. Docker bridge option đối chiếu https://docs.docker.com/engine/network/drivers/bridge/.
