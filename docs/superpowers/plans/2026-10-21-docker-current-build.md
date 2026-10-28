# Dựng bản hiện tại bằng Docker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Thực hiện trực tiếp trong phiên; chỉ dùng subagent nếu user chọn cách đó. Không viết hoặc chạy test theo AGENTS.md luật 4–6.

**Goal:** Build và chạy bản Cartoon hiện tại tại localhost trên Windows, với DB Supabase được xác nhận rõ trước khi áp dụng migration.

**Architecture:** Giữ Dockerfile và Compose hiện có: `migrate` áp dụng SQL rồi thoát, `app` chạy Next.js standalone, `worker` xử lý pgmq và render Remotion. App/worker dùng chung bind mount `data`; Postgres ở Supabase, 9router là dịch vụ ngoài. Build image tách khỏi chạy migration; Cloudflare Tunnel nằm ngoài phạm vi lượt dựng local.

**Tech Stack:** Theo lockfile: Next.js 15.5.28, React 19.1.0, Tailwind CSS 4.3.3, Drizzle ORM 0.45.4, Remotion 4.0.537. Dockerfile dùng `node:22-alpine` cho app và `node:22-bookworm-slim` cho worker/migrate. Máy hiện có Docker CLI 29.7.2, Compose v5.5.1, Codex CLI 0.163.0.

**Spec:** Yêu cầu trong chat: cài skill còn thiếu và lên kế hoạch dựng bản hiện tại qua Docker. Đối chiếu hai tài liệu `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md` và `docs/superpowers/specs/2026-10-21-series-project-design.md`; các dòng trạng thái cũ trong tài liệu không thay thế xác nhận của user cho DB đích ở lần triển khai này.

## Global Constraints

- Baseline: `master`, commit `be0a1487e34d3447702aff4e69524656d946c4cd` (`chore: edit ignore`); đã đồng bộ origin/master khi kiểm tra.
- Đây là kế hoạch; chưa build image, khởi động service hoặc chạy migration.
- Không đổi schema, SQL, hợp đồng dữ liệu, dependency hay cấu hình ứng dụng trong lượt triển khai dự kiến. Lỗi đòi hỏi thay đổi lớn/schema phải quay lại spec và xin duyệt theo AGENTS.md luật 3.
- Không tạo, sửa hay chạy file test. Xác minh bằng lint/build sẵn trong Dockerfile, trạng thái container, HTTP và thao tác vận hành được duyệt.
- Chạy local ở `127.0.0.1`; đặt `COMPOSE_PROFILES=`. Không khởi động tunnel hoặc upload YouTube trong lượt dựng này.
- Không in `.env`, token hoặc URL DB chứa mật khẩu. Dùng `docker compose config --quiet` khi kiểm tra cấu hình thật.
- Không tự áp dụng migration lên DB chưa xác định. Migration `0002_series_projects.sql` xóa dữ liệu nghiệp vụ, purge queue và có thể truncate checkpoint LangGraph; cần DB mới hoặc backup đã kiểm tra và xác nhận rõ phạm vi dữ liệu được phép xóa.

## Review Focus

1. Docker CLI có sẵn nhưng Engine chưa chạy: chỉ tiếp tục khi `docker version` có phần Server và đúng Linux engine.
2. Repo thiếu `.env` và CA cert: kiểm tra đủ cấu hình DB/TLS trước migration; không tắt xác minh TLS để vượt lỗi.
3. 9router chạy trên host: URL trong container phải truy cập được host; không dùng `localhost` của container để gọi dịch vụ trên Windows.
4. Bind mount và user khác nhau: worker phải ghi được `data`, app phải đọc được file đó; health HTTP không chứng minh được điều này.
5. Migration có lệnh xóa dữ liệu: xác nhận DB đích và lịch sử migration, hoàn tất backup nếu DB đã có dữ liệu, rồi mới thực hiện bước áp dụng.

## Task 1: Cài và kiểm tra công cụ agent

**Files:** Cấu hình người dùng ngoài repo: `C:/Users/asus/.agents/skills/`, `C:/Users/asus/.understand-anything/repo/`, `C:/Users/asus/.codex/config.toml`.

**Interfaces:** Cung cấp skill cho lượt tiếp theo và MCP Context7 tại `https://mcp.context7.com/mcp`.

- [x] Cài 15 skill Superpowers từ `obra/superpowers` bằng helper `skill-installer`, gồm brainstorming, writing-plans, systematic-debugging và verification-before-completion.
- [x] Chạy installer PowerShell chính thức của `Egonex-AI/Understand-Anything` cho Codex: 9 skill và junction plugin root. Có đủ understand, understand-chat, understand-diff, understand-dashboard.
- [x] Thêm Context7 remote MCP vào config người dùng, giữ các cấu hình khác và tạo backup `config.toml.before-cartoon-context7-20261021-194451.bak`.
- [x] Kiểm tra SKILL.md tồn tại; `codex mcp get context7` trả enabled; endpoint trả initialize/tools-list và thực thi thành công resolve-library-id, query-docs với tài liệu Docker.
- [ ] Ở lượt tiếp theo kiểm tra skill mới xuất hiện. Nếu client chưa nạp, khởi động lại client/phiên Codex; không giả định tool mới đã được gắn vào phiên cũ.

Chỉ cài skill ở bước này; chưa dựng knowledge graph. Việc phân tích rộng hoặc sửa lớn sau này cần chạy skill understand trước theo AGENTS.md.

## Task 2: Chuẩn bị Docker và cấu hình runtime

**Files:** Tạo local `.env` từ `.env.example`; đặt CA thật tại `certs/supabase-ca.crt` nếu cần; tạo `data/`. Không commit các file runtime này.

**Interfaces:** Cung cấp Docker Engine hoạt động, env hợp lệ và mount cho ba service hiện có.

- [ ] Khởi động Docker Desktop ở chế độ Linux containers. Chạy `docker version` và `docker compose version`; chỉ tiếp tục khi Engine trả lời.
- [ ] Xác nhận commit và `git status`; nếu mã nguồn đổi so với baseline thì xem diff Docker/migration trước khi tiếp tục.
- [ ] Chỉ khi chưa có `.env`, dùng `Copy-Item .env.example .env`; giữ nguyên file nếu user đã điền cấu hình.
- [ ] Điền DATABASE_URL của DB Supabase đích; xác nhận project/DB đúng và quyền tạo extension pgmq, bảng, index. Đây là kết nối Postgres, không phải publishable key.
- [ ] Đặt CA cert và `DATABASE_CA_CERT=certs/supabase-ca.crt` theo cấu hình TLS hiện có. Đảm bảo file này tồn tại trong bind mount `/app/certs`.
- [ ] Điền 9router URL/key và model writer, judge, image đúng trên router. Nếu 9router chạy trên Windows host, dùng hostname truy cập host của Docker Desktop, ví dụ `http://host.docker.internal:<port>/v1` khi router thật dùng đường dẫn `/v1`.
- [ ] Giữ `COMPOSE_PROFILES=` và chọn APP_PORT trống (mặc định 3000). YouTube có thể để trống cho lượt dựng local.
- [ ] Tạo `data/` nếu chưa có và chạy `docker compose config --quiet`. Thành công: exit 0, không in secret.

## Task 3: Build image, chưa đụng DB

**Files:** Đọc `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `package.json`, `package-lock.json`, `next.config.ts`; không sửa mặc định.

**Interfaces:** Tạo image cho `migrate`, `worker`, `app`; chưa tạo job hay migration.

- [ ] Chạy `docker compose build --pull migrate worker app` sau khi env hợp lệ.
- [ ] Xác nhận tất cả target build exit 0. Dockerfile app đã chạy `npm run lint` và `npm run build`; không chạy lại riêng nếu không có lỗi mới.
- [ ] Ghi lại image ID/base digest được build. Các tag Node hiện không pin digest, nên cần ghi nhận image thực tế nếu muốn tái lập đúng lần dựng này.
- [ ] Nếu lỗi tải dependency/Chrome hoặc biên dịch, lưu lỗi đã bỏ secret và xác định nguyên nhân trước khi sửa. Không đổi version hoặc bỏ bước lint để vượt build.

## Task 4: Áp dụng migration sau khi xác nhận DB

**Files:** Đọc `src/lib/db/migrate.ts` và `drizzle/0000_init.sql` đến `drizzle/0002_series_projects.sql`; không sửa SQL.

**Interfaces:** Cung cấp DB ở schema hiện tại; app/worker chỉ được chạy sau migration exit 0.

- [ ] Xác nhận DB đích là mới hay đã có dữ liệu, kiểm tra lịch sử migration ở chế độ chỉ đọc. Nếu `0002` đã được áp dụng thì không chạy thủ công lại SQL đó.
- [ ] Nếu DB có dữ liệu, sao lưu theo công cụ Supabase/Postgres đã đối chiếu tài liệu tại thời điểm thực hiện và xác nhận khả năng khôi phục; nêu rõ những dữ liệu mà `0002` sẽ xóa nếu còn pending.
- [ ] Nhận xác nhận rõ của user cho DB đích và việc áp dụng migration có thao tác xóa dữ liệu. Không lấy việc duyệt kế hoạch chung làm phép xóa mọi DB.
- [ ] Sau xác nhận, chạy `docker compose up --no-deps --exit-code-from migrate migrate`.
- [ ] Kiểm tra exit code 0 và `docker compose ps -a`; nếu migration lỗi thì dừng tại đây, chưa khởi động app/worker.

## Task 5: Khởi động và xác minh bản local

**Files:** Không sửa; sử dụng `/api/health`, trang Tổng quan/Jobs và handler `system.ping` sẵn có.

**Interfaces:** App tại `http://127.0.0.1:<APP_PORT>`, worker đọc queue, app đọc file worker ghi.

- [ ] Chỉ sau Task 4 thành công, chạy `docker compose up -d --no-deps app worker`. `--no-deps` ở đây có chủ đích vì migration đã được thực hiện và kiểm tra riêng.
- [ ] Chạy `docker compose ps -a` và `docker compose logs --tail 100 app worker`; app healthy, worker running, không lặp lỗi DB/TLS.
- [ ] Gọi `GET /api/health` và mở Tổng quan, Bộ phim, Project, Jobs. Health trả `{ "status": "ok" }` chỉ chứng minh HTTP hoạt động; Tổng quan phải hiển thị Database và queue kết nối được.
- [ ] Dùng nút **Ping worker** trên UI. Tương đương qua CLI trong container: `docker compose run --rm --no-deps worker node_modules/.bin/tsx src/worker/enqueue.ts system.ping`.
- [ ] Xác nhận job thành succeeded, `data/system/last-ping.json` được ghi và app đọc được file. Không dùng `npm run job` trong image vì script yêu cầu file `.env` trong khi image chỉ nhận biến môi trường.
- [ ] Kiểm tra 9router bằng chức năng sẵn có khi đã cấu hình model và user đồng ý thao tác gọi model. Sinh ảnh/render video và upload không phải điều kiện hoàn tất bản local này.
- [ ] Ghi kết quả thực tế, image ID, commit, URL local và các tích hợp còn chưa cấu hình. Không gọi bản dựng thành công nếu mới chỉ kiểm tra cú pháp Compose.

## Dừng và khôi phục

- Dừng app/worker bằng `docker compose stop app worker`; giữ `data/`, cert và `.env`.
- Nếu migration lỗi: giữ log và backup, xem trạng thái DB trước khi thử lại; không tự chạy SQL đảo ngược hoặc xóa dữ liệu.
- Nếu cần quay về bản ứng dụng trước: xác nhận image cũ tương thích schema đã áp dụng. Quay image không khôi phục dữ liệu đã bị migration xóa; DB phải phục hồi từ backup hoặc dùng DB thử mới theo quyết định của user.

## Điều kiện hoàn tất

- Skill bắt buộc đã có trên máy; Context7 đã qua một lượt resolve và query thật.
- Ba image build thành công; migration trên DB được xác nhận exit 0; app healthy và worker running.
- UI truy cập được tại localhost, DB/queue hoạt động, system.ping succeeded và file dùng chung đọc/ghi được.
- Không khởi động tunnel, không upload YouTube, không tạo/chạy file test.

## Nguồn và kiểm tra đã thực hiện khi lập kế hoạch

- Đã đọc package.json/lockfile, Dockerfile, Compose, .dockerignore, .env.example, client DB, migration và health route trong repo.
- `docker compose --env-file .env.example config --no-interpolate --quiet`: exit 0. Đây chỉ là kiểm tra cấu trúc, chưa xác nhận env thật hoặc Engine.
- Docker Engine hiện không kết nối được named pipe `dockerDesktopLinuxEngine`; `.env` chưa có; `certs/` chỉ có `.gitkeep` khi khảo sát.
- [Superpowers chính chủ](https://github.com/obra/superpowers), [Understand-Anything và cài Windows](https://github.com/Egonex-AI/Understand-Anything#-multi-platform-installation).
- [OpenAI: skill discovery](https://learn.chatgpt.com/docs/build-skills), [OpenAI: MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Context7 cho Codex](https://context7.com/docs/clients/codex).
- Context7 đã resolve Docker, chọn `/docker/docs` và query cách tách build/migrate/start; đối chiếu [Compose build](https://docs.docker.com/reference/cli/docker/compose/build/), [config](https://docs.docker.com/reference/cli/docker/compose/config/), [up](https://docs.docker.com/reference/cli/docker/compose/up/), [run](https://docs.docker.com/reference/cli/docker/compose/run/), [startup order](https://docs.docker.com/compose/how-tos/startup-order/), [profiles](https://docs.docker.com/compose/how-tos/profiles/).

**Handoff:** Chờ user xem và duyệt kế hoạch. Đề xuất thực hiện trực tiếp trong phiên vì các bước phụ thuộc tuần tự vào Engine, secret và DB đích. Việc xác nhận cụ thể DB và dữ liệu tại Task 4 vẫn là điều kiện riêng trước khi chạy migration.
