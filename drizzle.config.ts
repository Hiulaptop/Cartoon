import { defineConfig } from "drizzle-kit";

// Chỉ dùng cho `drizzle-kit generate` (sinh SQL từ schema, không cần kết nối DB).
// Migration được áp dụng bằng `npm run db:migrate` (src/lib/db/migrate.ts) để dùng chung cấu hình TLS với app.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
});
