# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Luật cứng (kiến thức phải xác nhận với nguồn chính thống, spec-driven cho thay đổi lớn/schema, **không tự viết và không tự chạy test**) và công cụ bắt buộc (superpowers, context7, understand-anything) nằm trong file được import dưới đây. Đọc và tuân thủ trước mọi việc khác.

@AGENTS.md

## Thông tin repo (kiểm tra lại với `package.json` trước khi dựa vào)

Dự án tên `cartoon`, một app Next.js duy nhất ở thư mục gốc (không monorepo, không thư mục con chứa project). Remote: `https://github.com/Hiulaptop/Cartoon.git`, nhánh `master`.

| Thành phần | Phiên bản cài thực tế |
|---|---|
| Next.js (App Router, Turbopack) | 15.5.28 |
| React / React DOM | 19.1.0 |
| Tailwind CSS (v4, qua `@tailwindcss/postcss`, không có `tailwind.config`) | 4.3.3 |
| TypeScript | 5.9.3 |
| ESLint (flat config, `next/core-web-vitals` + `next/typescript`) | 9.39.5 |
| shadcn CLI / style | 4.22.1 / `radix-nova`, baseColor `neutral`, icon `lucide` |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 |
| pg / tsx | 8.23.1 / 4.23.15 |
| Font | `geist` 1.8.1 (không dùng `next/font/google`) |
| Node: máy dev / image app / image worker | 24.15.0 / `node:22-alpine` / `node:22-bookworm-slim` |

Không có test runner (và agent không được tự thêm hay chạy test, xem AGENTS.md), không có `middleware.ts`. Migration nằm ở `drizzle/`.

## Lệnh thường dùng

```bash
npm run dev          # next dev --turbopack -H 127.0.0.1, http://127.0.0.1:3000
npm run worker       # tiến trình worker (đọc .env)
npm run job -- system.ping   # đẩy job từ dòng lệnh
npm run db:generate  # sinh SQL migration từ src/lib/db/schema.ts
npm run db:migrate   # áp dụng migration
npm run build        # next build --turbopack
npm run lint         # eslint
npx tsc --noEmit     # kiểm tra kiểu
npx shadcn@latest add <component>   # thêm component vào src/components/ui
```

Triển khai bằng Docker (đọc `.env`, xem README.md để biết cách lấy credential):

```bash
docker compose up -d --build   # migrate rồi chạy worker + app (127.0.0.1:3000)
docker compose down
```

`.env` bị `.gitignore` chặn; chỉ `.env.example` được commit.

## Kiến trúc

- **Supabase chỉ dùng Postgres.** App (server) và worker kết nối thẳng qua `DATABASE_URL` (Session pooler) bằng `pg` + Drizzle (`src/lib/db/client.ts`, một pool cho cả tiến trình, lưu trên `globalThis` cho Next dev). Luôn bật TLS có xác minh; tham số `sslmode`/`ssl*` trong URL bị bỏ vì `pg` cho chúng ghi đè object `ssl`. Chứng chỉ Supabase không có trong kho CA hệ thống (đã kiểm chứng), nên cần `DATABASE_CA_CERT=certs/supabase-ca.crt` (đường dẫn tương đối; compose mount `./certs`). Trình duyệt không gọi DB.
- **Schema:** `src/lib/db/schema.ts`; migration trong `drizzle/` sinh bằng `drizzle-kit generate`, áp dụng bằng `src/lib/db/migrate.ts` (`npm run db:migrate` hoặc service `migrate`). Đổi schema cần spec được duyệt (AGENTS.md luật 3). Lỗi truy vấn của Drizzle giấu lý do thật trong `cause`: dùng `errorMessage()` (`src/lib/errors.ts`).
- **Job:** một hàng đợi pgmq tên `jobs`. `enqueueJob()` (`src/lib/queue/jobs.ts`) ghi `job_runs` và `pgmq.send` trong cùng transaction. Worker (`src/worker/runner.ts`, `processOne`) đọc với thời gian ẩn 300 s, thử lại sau 10 s rồi 20 s, `failed` ở lần thứ 3; `PermanentJobError` để thất bại ngay. Thêm loại job = thêm vào `JOB_TYPES` và `handlers` (`src/worker/handlers.ts`). `pgmq.set_vt` có bản nạp chồng nên tham số phải ép kiểu `::integer`.
- **Code dùng chung app + worker không import `server-only`** (gói này ném lỗi ngoài React Server Components).
- **File:** `src/lib/storage` đọc ghi trong `DATA_DIR` (mặc định `./data`; `/app/data` trong container, compose mount `./data`), chặn đường dẫn thoát ra ngoài, ghi file tạm rồi đổi tên.
- **9router:** `src/lib/ninerouter/client.ts`: chat qua `/chat/completions` (OpenAI), ảnh qua `/images/generations?response_format=binary`. Router có thể ghi `Content-Type` sai, nên định dạng ảnh đọc bằng `sniffImage()`. Model có trong `/models` vẫn có thể bị upstream trả 404 (vd. `ag/gemini-3.6-flash-medium`); mặc định viết là `ag/gemini-3-flash`. Router chạy trên máy host mà app chạy trong Docker: dùng `host.docker.internal`.
- **Giao diện:** menu bên và trang Tổng quan dựng từ `PIPELINE_STEPS` (`src/lib/pipeline/steps.ts`); một bước dùng được khi mốc của nó thêm `href`. Trang dùng DB phải `export const dynamic = "force-dynamic"` (build không có DB).
- **Biến môi trường:** chỉ có biến phía server, đọc lúc chạy. Thêm biến mới phải sửa đồng bộ `.env.example` và anchor `x-runtime-env` trong `docker-compose.yml`.
- **Docker:** `Dockerfile` có target `worker` (Debian, `npm ci --omit=dev`, chạy bằng `tsx`) dùng cho service `migrate` và `worker`, và target `runner` (Alpine, Next standalone; `builder` chạy `npm run lint && npm run build`) cho `app`. `runner` là stage cuối nên là mặc định của `docker build`. App chỉ map `127.0.0.1:${APP_PORT}`. Máy dev đang có ứng dụng khác chiếm cổng 3000: kiểm tra trước khi chạy.
- **Bộ phim, Project, Design (2026-10-21):** `series` sở hữu `assets` (tên asset duy nhất trong từng bộ phim); `projects` là thư mục lồng nhau (`parent_id`, adjacency list, duyệt bằng recursive CTE trong `src/lib/project/queries.ts`; composite `ProjectNode`/`DesignNode` ở `src/lib/project/tree.ts`); design = bảng `videos` (có `series_id`, `project_id`), tên bảng giữ nguyên ở DB. Mọi danh mục asset phải gọi `loadApprovedCatalog(seriesId)` với `seriesId` của design. Bước 1 ở `/series/[seriesId]`, bước 2–7 ở `/designs/[id]/...` (tab trong layout). Xóa series/project bị chặn khi còn node con, asset hoặc design. `FormState` dùng chung ở `src/lib/form.ts`: file `"use server"` không được `export type ... from` (Turbopack báo lỗi). React 19 gọi `form.reset()` sau mỗi action: select có kiểm soát phải gửi giá trị qua input ẩn.
- **Publish (tunnel):** service `tunnel` (`cloudflare/cloudflared`, token `TUNNEL_TOKEN`) nằm trong profile compose `publish`, bật bằng `COMPOSE_PROFILES=publish` trong `.env`; để trống thì `docker compose up` không chạy tunnel (chế độ dev). Hostname `cartoon.studev.net` -> `http://app:3000` cấu hình trên Cloudflare Zero Trust, không nằm trong repo. App vẫn không có đăng nhập: người dùng đã chọn publish không có lớp bảo vệ (quyết định 2026-10-21).
- **shadcn:** `src/lib/utils.ts` chỉ `export { cn } from "cn"` (gói npm `cn` của shadcn), alias `@/*` trỏ vào `src/*`.
- **Assets (M2):** `src/lib/assets/` (chuẩn tên, xử lý ảnh, prompt, truy vấn) + `src/worker/asset-jobs.ts`. Ảnh `chr/prop/fx` sinh trên nền `#00FF00`, worker tách nền + khử ám xanh ở viền + cắt sát (`keyAndTrim`), lưu `data/assets/<assetId>/<state>.png`; `bg` chỉ chuyển PNG. Ảnh ra trình duyệt qua `GET /api/files/<path>` (chặn đường dẫn ngoài `DATA_DIR`). `JobContext`/`JobHandler`/`PermanentJobError` nằm ở `src/worker/job-types.ts`.
- **Khuôn JSON cảnh (M3):** `src/lib/scene/schema.ts` là hợp đồng dữ liệu duy nhất (zod, `version: 1`, 1920×1080, 30 fps, thời gian bằng frame). `checkSceneDsl` (lớp 1) tra asset đã duyệt trong DB. Component Remotion ở `src/remotion/` dùng chung cho Player (app, `assetMode: "url"`) và renderer (M6, `assetMode: "static"`); mã trong bundle Remotion không được import DB, `pg`, `sharp`, `fs`. Mọi gói `remotion`/`@remotion/*` ghim cùng phiên bản chính xác (4.0.537).
- **Kịch bản (M4):** `src/lib/script/` (khuôn `ScriptV1`, combo cố định `default-v1` nạp bằng `ensureDefaultCombo`, `checkScript` lớp 1, prompt) + `src/worker/script-jobs.ts`. `scripts.content = { meta, script?, issues? }`: `meta` giữ đầu vào (asset, thời lượng, lý do bị loại) để sinh lại. Ngưỡng phụ đề (20 ký tự/giây, 42 ký tự × 2 dòng, 5/6–7 giây; nguồn Netflix) chỉ ở `src/lib/validation/subtitle.ts`. App phải tạo hàng `scripts` (`generating`) **trước** khi đẩy job để job chạy lại không tạo trùng.
- **Phân cảnh (M5):** `planScenes` (tất định) → đồ thị LangGraph `write → check → judge → settle` trong `src/worker/scene-graph.ts`, job `scenes.generate` (`src/worker/scene-jobs.ts`). Checkpoint của `PostgresSaver` nằm trong schema Postgres `langgraph` (tạo bởi `setup()`), `thread_id` = `jobRunId` nên job thử lại chạy tiếp được. Giám khảo (`LLM_JUDGE_MODEL`) mặc định phải khác họ model viết (`assertDifferentFamily`); ngoại lệ tạm `LLM_JUDGE_ALLOW_SAME_FAMILY=true` gắn `sameFamily` vào `validations.scores`. Tiêu chí, ngưỡng đạt 3.5 và `RUBRIC_VERSION` ở `src/lib/judge/rubric.ts`. Thoại trong JSON cảnh phải đúng nguyên văn kịch bản (lớp 1). Model hay chép khóa `$schema` vào JSON cảnh: worker bỏ khóa đó trước khi kiểm khuôn. Mọi lần kiểm lớp 1 và chấm đều ghi `validations`.
- **Render (M6):** job `video.render` (`src/worker/render-jobs.ts`) bundle `src/remotion/index.ts` với `publicDir` tạm chứa đúng ảnh dùng (`assetMode: "static"`), `renderMedia` h264 ra `data/renders/<renderId>.mp4`, `licenseKey: "free-license"` (người dùng xác nhận tối đa 3 người vận hành). `@remotion/bundler` và `@remotion/renderer` chỉ được import trong `src/worker/`. Bundle là webpack riêng: alias `@` khai báo trong `webpackOverride`. Job dài gia hạn khóa bằng `ctx.extendLock(seconds)` (`pgmq.set_vt`). Image worker có Chrome Headless Shell (cache `/app/.remotion`; Remotion còn ghi vào `/app/node_modules/.remotion` nên cả hai thư mục thuộc user `node`), nặng 1.8 GB. `/api/files` hỗ trợ `Range` để tua MP4. Worker xử lý tuần tự nên một lần render chặn các job khác. Container `restart: unless-stopped` tự bật lại khi Docker khởi động: container cũ có thể nuốt job mới vì thiếu handler, nên rebuild hoặc `docker compose down` trước khi chạy worker cục bộ.
- **Upload YouTube (M7):** `src/worker/upload-jobs.ts` + `src/lib/youtube/`. `videos.insert` luôn gửi `privacyStatus` tường minh (bỏ trống thì YouTube mặc định public), `selfDeclaredMadeForKids=false`, `containsSyntheticMedia=false`. Upload bằng `googleapis` là multipart (không resumable). `DeferredJobError` hẹn lại job mà không tính lần thử (runner đếm `metrics.deferrals`; hết hạn mức ngày, cửa sổ trượt 24 giờ). Thiếu cấu hình OAuth hoặc `invalid_grant` → job `failed` ngay kèm hướng dẫn chạy `npm run youtube:auth`. Refresh token (`YOUTUBE_REFRESH_TOKEN`, ghi bởi script đó, không in ra) hết hạn sau 7 ngày khi project OAuth ở Testing. Bí mật chỉ nằm ở `.env`.
