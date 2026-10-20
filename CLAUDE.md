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
| `@supabase/supabase-js` / `@supabase/ssr` | 2.118.0 / 0.12.7 |
| Font | `geist` 1.8.1 (không dùng `next/font/google`) |
| Node: máy dev / image Docker | 24.15.0 / `node:22-alpine` |

Không có test runner (và agent không được tự thêm hay chạy test, xem AGENTS.md), không có thư mục `supabase/` (chưa có migration hay schema), không có `middleware.ts`.

## Lệnh thường dùng

```bash
npm run dev      # next dev --turbopack, http://localhost:3000
npm run build    # next build --turbopack
npm run lint     # eslint
npx tsc --noEmit # kiểm tra kiểu (không có script riêng)
npx shadcn@latest add <component>   # thêm component vào src/components/ui
```

Triển khai bằng Docker (đọc `.env`, xem README.md để biết cách lấy credential):

```bash
docker compose up -d --build   # build và chạy app tại :3000
docker compose down
```

`.env` bị `.gitignore` chặn; chỉ `.env.example` được commit.

## Kiến trúc

- **Supabase Cloud, không tự host.** Repo từng có stack Supabase self-host trong compose nhưng đã gỡ; `docker-compose.yml` chỉ còn service `app`. Client và server dùng chung `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` qua `src/lib/supabase/config.ts`. `client.ts` (browser, `createBrowserClient`) và `server.ts` (`createServerClient` với `cookies()` của Next) là hai điểm tạo client duy nhất. Không đưa `service_role`/secret key vào biến `NEXT_PUBLIC_*`.
- **Hai loại biến môi trường, hành vi build khác nhau.** `NEXT_PUBLIC_*` bị nhúng vào bundle lúc build, nên được truyền qua `build.args` trong compose và `ARG`/`ENV` trong `Dockerfile`; đổi chúng phải `--build` lại. Compose dùng `${VAR:?...}` nên thiếu giá trị sẽ báo lỗi ngay. Biến chỉ-server (`NINE_ROUTER_*`) đọc lúc chạy qua `environment` của compose, đổi chỉ cần `docker compose up -d`. Thêm biến mới phải sửa đồng bộ `.env.example`, `docker-compose.yml` và (nếu `NEXT_PUBLIC_*`) `Dockerfile`.
- **9router** (gateway gọi model, chưa tích hợp). `src/lib/ninerouter/config.ts` import `server-only` và export `NINE_ROUTER_BASE_URL`/`NINE_ROUTER_API_KEY`; chỉ import từ code chạy trên server. Định dạng API của 9router chưa được xác minh (rule 1 áp dụng khi tích hợp). Trong Docker, router chạy trên máy host phải dùng `host.docker.internal` thay cho `localhost`.
- **Dockerfile nhiều giai đoạn** (`deps` → `builder` → `runner`): `builder` chạy `npm run lint && npm run build`, nên lỗi lint làm hỏng build Docker. `next.config.ts` đặt `output: "standalone"`, runner chạy `node server.js` bằng user không phải root; healthcheck gọi `/api/health`.
- **shadcn:** `src/lib/utils.ts` chỉ `export { cn } from "cn"` (gói npm `cn`, do shadcn 4.22.1 sinh ra), alias `@/*` trỏ vào `src/*`.
- `src/app/page.tsx` là trang trạng thái: server component `force-dynamic` gọi `${SUPABASE_URL}/auth/v1/health` kèm `apikey` để báo kết nối Supabase.
