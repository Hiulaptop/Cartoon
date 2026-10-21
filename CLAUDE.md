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
- **shadcn:** `src/lib/utils.ts` chỉ `export { cn } from "cn"` (gói npm `cn` của shadcn), alias `@/*` trỏ vào `src/*`.
