# Cartoon

Next.js 15 (App Router) · shadcn/ui · Tailwind CSS v4 · ESLint · Supabase Cloud, đóng gói bằng Docker.

## Chạy bằng Docker (một lệnh)

Yêu cầu: Docker có Compose v2.

1. Tạo file `.env` từ mẫu:

   ```bash
   cp .env.example .env
   ```

   Trên PowerShell: `Copy-Item .env.example .env`

2. Mở `.env` và điền 2 giá trị lấy từ Supabase (xem mục bên dưới).

3. Build và chạy:

   ```bash
   docker compose up -d --build
   ```

4. Mở http://localhost:3000. Thẻ "Supabase Auth" hiện **Hoạt động** nghĩa là kết nối thành công.

Dừng app: `docker compose down`.

> `NEXT_PUBLIC_*` được nhúng vào bundle lúc build. Mỗi khi sửa `.env` bạn phải chạy lại `docker compose up -d --build`.

## Lấy credential từ Supabase Cloud

### 1. Tạo project

1. Đăng nhập (hoặc đăng ký) tại https://supabase.com/dashboard.
2. Chọn **New project**, đặt tên, đặt **Database password** (hãy lưu lại), chọn **Region** gần người dùng nhất.
3. Chờ project khởi tạo xong (khoảng vài phút).

### 2. Lấy `NEXT_PUBLIC_SUPABASE_URL`

1. Trong project, vào **Project Settings** (biểu tượng bánh răng) → **API** (hoặc **Data API**).
2. Sao chép **Project URL**, dạng `https://<project-ref>.supabase.co`.
3. Dán vào `NEXT_PUBLIC_SUPABASE_URL` trong `.env`.

Nếu không thấy mục này, bạn có thể tự ghép URL: `https://<project-ref>.supabase.co`, trong đó `<project-ref>` là chuỗi trong đường dẫn dashboard `.../project/<project-ref>`.

### 3. Lấy `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

1. Vẫn ở **Project Settings** → **API Keys**.
2. Chọn **một trong hai** (cả hai đều dùng được):
   - **Publishable key** (`sb_publishable_...`), loại mới, nên dùng.
   - Hoặc **anon key** (`eyJ...`) ở tab *Legacy API Keys*, chỉ khi project chưa có publishable key.
3. Dán vào `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` trong `.env`.

> **Quan trọng:** đây là khóa công khai, được gửi xuống trình duyệt. Quyền truy cập dữ liệu do **Row Level Security (RLS)** quyết định, nên hãy bật RLS cho mọi bảng.
> **Không bao giờ** dán `service_role` hoặc `secret` key vào biến `NEXT_PUBLIC_*`. Hai khóa đó bỏ qua RLS.

### 4. Cấu hình Auth (khi dùng đăng nhập)

Vào **Authentication** → **URL Configuration**:

- **Site URL**: `http://localhost:3000` (khi chạy local) hoặc domain thật khi deploy.
- **Redirect URLs**: thêm các URL app sẽ nhận redirect sau khi đăng nhập, ví dụ `http://localhost:3000/**`.

## Phát triển không dùng Docker

```bash
npm install
cp .env.example .env.local   # điền cùng 2 giá trị như trên
npm run dev                  # http://localhost:3000
npm run lint
```

## Cấu trúc chính

| Đường dẫn | Mô tả |
|---|---|
| `src/app/` | Trang và route (App Router) |
| `src/components/ui/` | Component shadcn/ui (thêm mới: `npx shadcn@latest add <tên>`) |
| `src/lib/supabase/` | Supabase client: `client.ts` (trình duyệt), `server.ts` (server) |
| `Dockerfile` | Build nhiều giai đoạn: lint, build, chạy bản standalone |
| `docker-compose.yml` | Chạy app, đọc biến từ `.env` |
