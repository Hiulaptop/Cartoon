# Supabase local riêng cho Cartoon

- Ngày: 2026-10-21.
- Trạng thái: user đã yêu cầu bắt đầu triển khai local trong chat ("bắt đầu build local").
- Yêu cầu: bỏ qua pipeline mới; dùng một instance Supabase riêng chạy Docker để không cần DB của teammate.

## Mục tiêu và phạm vi

Chạy Supabase local trên Windows bằng CLI chính thức quản lý Docker, có Postgres và Studio. Cartoon app/worker kết nối trực tiếp Postgres local, dùng các migration Drizzle hiện có và hàng đợi pgmq. DB mới không chứa hoặc sao chép dữ liệu của teammate.

User đã xác nhận trong chat: **chỉ để chạy local**. Chỉ sử dụng trên máy người vận hành, không public và không mở truy cập cho teammate. Việc chia sẻ qua mạng nằm ngoài phạm vi thiết kế này.

Không bao gồm pipeline I2V/R2V, thay đổi bảng/cột/type DB, Supabase Auth/Storage cho Cartoon, dữ liệu mẫu, YouTube upload hoặc Cloudflare Tunnel.

## Hiện trạng đã xác minh

- Repo ở master, baseline be0a148; có các file plan/config chưa tracked, phải giữ nguyên.
- Docker Engine đang chạy, Linux amd64; Docker 29.7.2, Compose v5.5.1. Chưa có Supabase CLI global.
- Host Node 24.21.0; npm registry công bố CLI Supabase stable 2.121.0. Template chính thức của tag này dùng Postgres major 17.
- Theo lockfile: Next.js 15.5.28, Drizzle ORM 0.45.4, pg 8.23.1.
- .env đã có cấu hình 9router; DATABASE_URL và DATABASE_CA_CERT trống khi khảo sát. Không ghi đè các giá trị user đã nhập.
- Cổng host 5432 đang có dịch vụ khác; 54321–54324 và 3000 không có listener tại lúc kiểm tra. Phải kiểm tra lại khi thực hiện.
- src/lib/db/client.ts hiện luôn bật TLS với xác minh CA; không thể chỉ đổi DATABASE_URL rồi mặc định cho rằng DB local hoạt động.
- Migration 0001 cần extension pgmq. Migration 0002 có thao tác xóa dữ liệu nghiệp vụ; chỉ được chạy trên DB local mới được tạo và xác minh trong lượt triển khai được duyệt này.

## Cách dựng được đề xuất

1. Pin supabase CLI 2.121.0 trong devDependencies; CLI không đi vào worker production dependencies. Dùng cấu hình local project_id `cartoon-local` để phân biệt container/volume.
2. Tạo supabase/config.toml theo CLI chính thức: Postgres 17, DB port 54322, Studio port 54323, API port 54321. Các service CLI mặc định có thể chạy kèm; Cartoon vẫn chỉ dùng Postgres. Không liên kết hoặc đăng nhập vào project Cloud.
3. Tách cơ chế quản lý DB: Supabase CLI dựng hạ tầng; Drizzle tiếp tục là chủ sở hữu migration ứng dụng. Không copy SQL Drizzle sang supabase/migrations và không chạy reset/push để áp dụng trùng.
4. Tạo script npm để start/stop/status Supabase local, thêm hướng dẫn vào README. Lệnh stop thông thường giữ dữ liệu; không sử dụng tùy chọn xóa volume hoặc reset trong quy trình thường ngày.
5. Dùng user-defined bridge network riêng tên `cartoon-local`, đặt driver option `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`. Supabase start nhận `--network-id cartoon-local`. Xác minh thực tế cho thấy Docker Desktop vẫn publish mọi interface khi CLI không đặt HostIp; helper vì vậy dùng proxy Docker API tạm thời qua named pipe riêng (Windows) hoặc Unix socket trong thư mục mode 0700, không mở Docker TCP API. Chỉ sửa PortBindings của lệnh create cho project cartoon-local thành 127.0.0.1 trước khi container được tạo. Không sửa daemon hoặc container project khác. Proxy đóng sau khi start xong; docker inspect kiểm tra lại actual bindings, sai thì dừng stack.
6. Tắt Analytics/Logflare tùy chọn: Vector trên Windows cố kết nối Docker TCP API cổng 2375 và liên tục restart. Cartoon chỉ cần database/Studio; log app/worker vẫn xem được qua Compose. Không bật Docker TCP API để phục vụ chức năng này.
6. Thêm `docker-compose.local.yml` làm override cho app/worker/migrate, gắn thêm external network `cartoon-local` bên cạnh mạng default của Cartoon. Các container nối DB qua tên container Supabase và port nội bộ 5432, không qua host.docker.internal. App host vẫn giữ bind 127.0.0.1 như Compose hiện có. Không sửa networking của container khác.

## Kết nối app và TLS

- Thêm biến `DATABASE_SSL_MODE`, chỉ chấp nhận `verify-full` hoặc `disable`; mặc định `verify-full` giữ hành vi hiện tại.
- `disable` chỉ dành cho DB local; code từ chối nếu hostname không thuộc localhost, 127.0.0.1, ::1 hoặc tên container chính xác `supabase_db_cartoon-local`. Cho phép IPv6 loopback ở cả dạng URL parser trả có ngoặc và dạng chuẩn hóa không ngoặc. Không cho phép hostname tùy ý qua wildcard.
- Khi `verify-full`, giữ xác minh CA/hostname bằng pg ssl config hiện tại và DATABASE_CA_CERT. Không thêm rejectUnauthorized=false.
- Khi `disable` hợp lệ, truyền ssl:false; đây là lựa chọn chủ động cho DB local trong Docker, không suy ra từ NODE_ENV vì app local Docker vẫn build production.
- Truyền biến mới qua x-runtime-env trong docker-compose.yml. Cập nhật .env.example và README, không đổi schema SQL.
- App/worker/migrate trong Docker dùng `supabase_db_cartoon-local:5432` trên mạng chung. Lệnh chạy trực tiếp trên Windows dùng `127.0.0.1:54322`. Trước khi chạy migration phải kiểm tra tên container thực tế đúng tên pin; nếu khác thì dừng và sửa thiết kế, không tự dùng DB khác.
- Khi chọn chạy local, .env dùng DATABASE_URL cho kết nối từ host và DATABASE_SSL_MODE=disable để các lệnh trên Windows cũng dùng đúng chế độ local. Override Compose local nhận biến `LOCAL_DATABASE_URL` riêng có hostname container và ghi đè DATABASE_URL chỉ trong ba service; đặt DATABASE_SSL_MODE=disable trong override local. Cấu hình mặc định trong Compose gốc dùng verify-full khi biến không được đặt. Khi đổi lại URL cloud, phải đổi mode về verify-full; allowlist sẽ từ chối URL cloud nếu để nhầm disable. Không đưa credentials local vào file tracked.
- Mật khẩu/credentials local lấy từ instance vừa tạo; không sử dụng mật khẩu DB teammate. Không in token hoặc URL có mật khẩu ra log bàn giao. Giữ các cấu hình 9router trong .env.

## Trình tự triển khai sau duyệt

1. Viết implementation plan với tên file, lệnh và expected output cụ thể sau khi thiết kế được duyệt.
2. Cài CLI pin, khởi tạo cấu hình và mạng/volume với project identity mới; trước start kiểm tra không có instance/volume cùng identity từ trước. Nếu có thì dừng để xác định dữ liệu, không reset hoặc reuse mù.
3. Dựng Supabase; kiểm tra DB/Studio, phiên bản Postgres và pg_available_extensions có pgmq. Nếu thiếu pgmq thì dừng, không tự đổi image hoặc tạo migration thay thế.
4. Chỉnh kết nối local theo mục TLS đã duyệt, build app/worker hiện tại. Xác minh mục tiêu DATABASE_URL đúng instance mới trước khi migrate.
5. Chỉ sau các bước trên mới áp dụng nguyên trạng các migration Drizzle lên DB local mới. Việc user duyệt bản thiết kế này cấp phép migration cho đúng DB mới đó, không cấp phép chạy lên DB khác.
6. Khởi động app/worker và xác minh DB, queue, system.ping, file data dùng chung; không gọi model trả phí hoặc upload YouTube trong tiêu chí hoàn tất.

## Tiêu chí hoàn tất và giới hạn

- Studio local truy cập được; tên/phiên bản/ports và volume của instance được ghi lại, không trùng dịch vụ đã có.
- App/worker kết nối được DB, migration hoàn tất, pgmq có hàng đợi jobs, system.ping succeeded.
- Dừng/khởi động lại không mất dữ liệu; không reset DB để chứng minh điều này.
- Cấu hình Supabase Cloud vẫn dùng verify-full mặc định; local disable phải có hostname hợp lệ.
- Không sửa/chạy file test theo AGENTS.md. Kiểm tra bằng lint/build, trạng thái container, SQL metadata ở chế độ chỉ đọc và thao tác system.ping được nêu trong spec.
- Không đụng DB teammate hoặc container/volume khác của máy.

## Nguồn đối chiếu

- [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), [cấu hình CLI](https://supabase.com/docs/guides/local-development/cli/config), [CLI reference](https://supabase.com/docs/reference/cli/supabase-start).
- [Template config của CLI v2.121.0](https://github.com/supabase/cli/blob/v2.121.0/apps/cli-go/pkg/config/templates/config.toml), [CLI Postgres container setup](https://github.com/supabase/cli/blob/v2.121.0/apps/cli-go/internal/db/start/start.go).
- [Self-host bằng Docker](https://supabase.com/docs/guides/self-hosting/docker), [pgmq](https://supabase.com/docs/guides/queues/pgmq).
- Đã dùng Context7 /supabase/supabase cho self-host và TLS; [node-postgres SSL](https://node-postgres.com/features/ssl) đối chiếu ssl config hiện có.
- [Docker bridge networking](https://docs.docker.com/engine/network/drivers/bridge/) và flag --network-id trong CLI reference cho mạng local dùng chung và bind loopback.
