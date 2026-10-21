# M1: Nền móng + khung giao diện 7 bước — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng nền móng chạy được của hệ thống (Postgres trên Supabase + schema, hàng đợi pgmq, worker, lưu file, client 9router) và khung giao diện có menu 7 bước, để các mốc M2–M7 lần lượt bật từng bước.

**Architecture:** App Next.js và một tiến trình worker Node (chạy TypeScript bằng `tsx`) dùng chung code trong `src/lib`. Cả hai kết nối thẳng Postgres của Supabase qua `pg` + Drizzle, luôn có TLS xác minh chứng chỉ. App đẩy job (ghi `job_runs` + `pgmq.send` trong một transaction); worker đọc bằng `pgmq.read`, thử lại theo backoff, ghi kết quả vào `job_runs`. Docker Compose có 3 service: `migrate` (chạy migration rồi thoát), `worker`, `app` (chỉ nghe `127.0.0.1`). App và worker dùng chung `./data`.

**Tech Stack:** Next.js 15.5.28, React 19.1.0, drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1, tsx 4.23.15, pgmq (extension Postgres trên Supabase), Docker (`node:22-alpine` cho app, `node:22-bookworm-slim` cho worker).

**Spec:** `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md` (§3 kiến trúc, §4 mô hình dữ liệu, §8 xử lý lỗi, §9 biến môi trường, §11 M1)

## Global Constraints

- **Không có test tự động** (AGENTS.md luật 4–6): không tạo hay chạy `*.test.*`/`*.spec.*`. Xác minh bằng lint, `tsc`, build và chạy thật (migrate, worker, giao diện).
- **Duyệt plan này = duyệt schema DB** ở Task 2 (luật 3) và các khác biệt so với spec liệt kê bên dưới.
- **Duyệt plan này = đồng ý các thao tác thật sau:** ghi vào DB Supabase (bật `pgmq`, tạo bảng, tạo/xóa hàng đợi và schema thử, job thử); 1–2 lời gọi chat rất ngắn qua 9router (`system.llm_ping`). M1 không sinh ảnh, không đụng YouTube.
- **Không in bí mật** (`DATABASE_URL`, key, token) ra terminal hay chat.
- **Commit theo luật 7:** `git add` từng file, Conventional Commits, đúng scope, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Không commit `.env`, `data/`, `certs/*.crt`, `node_modules/`.
- **Code dùng chung app + worker không được import `server-only`**: gói đó ném lỗi khi chạy ngoài React Server Components (đã kiểm tra: export mặc định của nó `throw`).
- App chỉ nghe `127.0.0.1` (spec §13: chưa có đăng nhập): `next dev/start -H 127.0.0.1`, compose map `127.0.0.1:${APP_PORT}:3000`.
- Postgres luôn TLS có xác minh (`pg` mặc định không TLS, Supabase không bắt buộc SSL). Bỏ `sslmode`/`ssl*` khỏi URL vì `pg` cho chúng ghi đè object `ssl`.
- Biến môi trường mới phải có trong `.env.example` và anchor `x-runtime-env` của compose (CLAUDE.md).

## Khác biệt so với spec §4/§3/§9 (cần duyệt cùng plan)

| # | Spec | Plan | Lý do |
|---|---|---|---|
| 1 | `scenes.order` | `scenes.position` | `order` là từ khóa SQL |
| 2 | `renders.duration` | `renders.duration_ms` (integer) | Rõ đơn vị |
| 3 | `videos.status` | enum `scripting, storyboarding, rendering, uploading, done`; `videos.channel_id` cho phép NULL | Spec ghi "đang ở bước nào"; kênh chỉ bắt buộc ở bước upload |
| 4 | `uploads.status` | dùng enum `job_status` (`queued, running, succeeded, failed`) | Upload là thao tác, không phải thứ cần duyệt |
| 5 | `job_runs` | thêm `queue_msg_id`, `created_at`; `target_type/target_id` cho phép NULL | Đối chiếu với message pgmq; job hệ thống không có đối tượng |
| 6 | Tham chiếu đa hình | enum `target_type`: `asset, asset_variant, video, script, scene, render, upload` | Giới hạn giá trị hợp lệ |
| 7 | `combos` | cột `definition jsonb`; **chưa nạp combo** (nội dung chốt ở M4) | Spec để chi tiết cho spec combo/ACE |
| 8 | Compose 2 service | 3 service: thêm `migrate` (chạy migration rồi thoát) | Migration chạy tự động trước app/worker |
| 9 | Worker | chạy TypeScript bằng `tsx`; image worker ≈ 1 GB | Không cần bước build riêng; image lớn vì cài cả dependency của app |
| 10 | Hàng đợi | một hàng đợi pgmq tên `jobs`; thời gian ẩn 300 s; thử lại sau 10 s, 20 s; tối đa 3 lần | Spec §8 ("sau 3 lần thì failed") |
| 11 | `DATABASE_CA_CERT` | đường dẫn tương đối tính từ thư mục chạy, vd. `certs/supabase-ca.crt`; compose mount `./certs` | Cùng một giá trị dùng được ở máy dev và trong container |

## File Structure

| File | Trách nhiệm |
|---|---|
| `drizzle.config.ts` | Cấu hình drizzle-kit (chỉ để sinh SQL) |
| `drizzle/0000_init.sql`, `drizzle/0001_pgmq_jobs_queue.sql`, `drizzle/meta/*` | Migration (sinh bởi drizzle-kit, commit vào repo) |
| `src/lib/db/schema.ts` | Schema Drizzle: 8 enum, 12 bảng |
| `src/lib/db/client.ts` | Pool `pg` (TLS) + Drizzle, một instance cho cả tiến trình |
| `src/lib/db/migrate.ts` | Entry chạy migration |
| `src/lib/errors.ts` | `errorMessage()`: lấy lý do thật từ `cause` của lỗi Drizzle |
| `src/lib/queue/jobs.ts` | Loại job, `enqueueJob()`, `listRecentJobs()` |
| `src/lib/queue/consume.ts` | `readJob`, `archiveJob`, `retryJobIn`, `queueLength` (SQL pgmq) |
| `src/lib/storage/index.ts` | Đọc ghi file trong `DATA_DIR`, chặn đường dẫn thoát ra ngoài, ghi nguyên tử |
| `src/lib/ninerouter/client.ts` | `chat()`, `generateImage()`, `sniffImage()`, `requireModel()` (thay `config.ts`) |
| `src/worker/handlers.ts` | Handler theo loại job (`system.ping`, `system.llm_ping`) |
| `src/worker/runner.ts` | `processOne(db)`: xử lý một job, thử lại, ghi `job_runs` |
| `src/worker/index.ts` | Vòng lặp worker, dừng êm khi SIGINT/SIGTERM |
| `src/worker/enqueue.ts` | CLI: `npm run job -- <loại>` |
| `src/lib/pipeline/steps.ts` | 7 bước (nguồn duy nhất cho menu và trang Tổng quan) |
| `src/lib/format.ts` | `timeAgo()` |
| `src/lib/system/status.ts` | Trạng thái DB, hàng đợi, 9router, lần ping cuối |
| `src/app/actions.ts` | Server action đẩy job |
| `src/components/app-sidebar.tsx`, `job-buttons.tsx`, `refresh-button.tsx` | Menu bên, nút đẩy job, nút làm mới |
| `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/jobs/page.tsx` | Khung giao diện, Tổng quan, Jobs |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore` | Image app + worker; 3 service |
| `certs/.gitkeep`, `.gitignore` | Chỗ đặt CA cert (không commit file cert) |
| `.env.example`, `README.md`, `CLAUDE.md`, spec | Cấu hình mẫu và tài liệu |

Gỡ bỏ: `src/lib/supabase/*`, `src/lib/ninerouter/config.ts`, gói `@supabase/ssr`, `@supabase/supabase-js`, `server-only`.

---

### Task 0: Commit các bản sửa từ code review

**Files:** (đang sửa dở trong working tree từ lượt code review trước)

- [ ] **Step 1: Commit theo 4 scope**

```bash
git add tsconfig.json .dockerignore
git commit -m "fix(build): keep spikes and data out of app type-check and docker context

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add src/app/page.tsx
git commit -m "fix(app): cancel status probe body and join supabase url safely

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add .env.example scripts/spikes/m0/README.md scripts/spikes/m0/image-probe.mjs scripts/spikes/m0/alpha-check.mjs scripts/spikes/m0/db-probe.mjs scripts/spikes/m0/youtube-auth.mjs scripts/spikes/m0/youtube-upload.mjs scripts/spikes/m0/remotion/.dockerignore scripts/spikes/m0/remotion/public/.gitkeep
git commit -m "fix(spike): harden m0 probe scripts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add docs/superpowers/spikes/2026-10-21-m0-findings.md
git commit -m "docs(spike): mark m0 reference-image result as confounded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add docs/superpowers/plans/2026-10-21-m1-foundation.md
git commit -m "docs(plan): add m1 foundation plan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `git status --short` sạch.

---

### Task 1: Kết nối Supabase thật (chạy phép thử M0-b)

**Files:**
- Create: `certs/.gitkeep`
- Modify: `.gitignore`, `docs/superpowers/spikes/2026-10-21-m0-findings.md`

**Interfaces:**
- Produces: biết `DATABASE_URL` (Session pooler) kết nối được với TLS xác minh bằng kho CA hệ thống hay cần `DATABASE_CA_CERT=certs/supabase-ca.crt`. Extension `pgmq` đã bật.

- [ ] **Step 1: Kiểm tra `.env` có `DATABASE_URL`** (chỉ in tên biến, không in giá trị)

Run: `grep -qE "^DATABASE_URL=.+" .env && echo có || echo THIẾU`
Nếu `THIẾU`: **DỪNG**, nhắn user điền `DATABASE_URL` (Supabase → Connect → Session pooler, cổng 5432) vào `.env` rồi mới làm tiếp.

- [ ] **Step 2: Chỗ đặt CA cert**

Tạo `certs/.gitkeep` (file rỗng). Thêm vào cuối `.gitignore`:

```gitignore

# CA cert tải từ Supabase (Database Settings → SSL Configuration); không commit
/certs/*
!/certs/.gitkeep
```

- [ ] **Step 3: Chạy phép thử**

Run: `node --env-file=.env scripts/spikes/m0/db-probe.mjs`
Expected:
- `TLS: bắt buộc, ...`
- `pgmq: lần1=1, ẩn=0, hiện lại=1, read_ct=2`
- `count=42`
- `Đã dọn hàng đợi và schema thử`

Nếu lỗi có chữ `certificate`: **DỪNG**, nhắn user tải CA cert ở Supabase **Database Settings → SSL Configuration**, lưu thành `certs/supabase-ca.crt`, thêm `DATABASE_CA_CERT=certs/supabase-ca.crt` vào `.env`. Chạy lại Step 3.

Nếu `create extension` báo thiếu quyền: **DỪNG** và báo user (spec phải đổi cách xếp hàng đợi).

- [ ] **Step 4: Ghi kết quả vào kết luận M0**

Trong `docs/superpowers/spikes/2026-10-21-m0-findings.md`:
- Hai dòng `(b) pgmq trên Supabase` và `(b) PostgresSaver` của bảng Tóm tắt: thay "**Chưa chạy.** ..." bằng kết quả thật (đạt/không, độ trễ, có cần CA cert không).
- Mục `### (b) Postgres`: thay nội dung bằng loại chuỗi kết nối đã dùng, các dòng output (không kèm bí mật), độ trễ.
- Dòng `pgmq trên Supabase; loại chuỗi kết nối` trong bảng mục 12: ghi đã xác minh.

- [ ] **Step 5: Commit**

```bash
git add certs/.gitkeep .gitignore docs/superpowers/spikes/2026-10-21-m0-findings.md
git commit -m "docs(spike): record m0 postgres probe result

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Schema DB, migration và kết nối Postgres

**Files:**
- Create: `drizzle.config.ts`, `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/migrate.ts`, `src/lib/errors.ts`, `drizzle/*` (sinh tự động)
- Modify: `package.json`, `package-lock.json`, `.env.example`

**Interfaces:**
- Produces:
  - `getDb(): Db`, `getPool(): pg.Pool`, `type Db = NodePgDatabase<typeof schema>` (`@/lib/db/client`)
  - Bảng và enum trong `@/lib/db/schema` (`jobRuns`, `targetType`, `type JobRun`...)
  - `errorMessage(error: unknown): string` (`@/lib/errors`)
  - Script `npm run db:generate`, `npm run db:migrate`

- [ ] **Step 1: Cài dependency**

```bash
npm install drizzle-orm@0.45.4 pg@8.23.1 tsx@4.23.15
npm install -D drizzle-kit@0.31.11 @types/pg@8.23.1
```

`tsx` nằm ở `dependencies` vì worker và migrate chạy bằng nó trong image production.

- [ ] **Step 2: Thêm script vào `package.json`** (giữ nguyên 4 script cũ)

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "tsx --env-file=.env src/lib/db/migrate.ts"
```

- [ ] **Step 3: Tạo `drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

// Chỉ dùng cho `drizzle-kit generate` (sinh SQL từ schema, không cần kết nối DB).
// Migration được áp dụng bằng `npm run db:migrate` (src/lib/db/migrate.ts) để dùng chung cấu hình TLS với app.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
});
```

- [ ] **Step 4: Tạo `src/lib/db/schema.ts`**

```ts
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Trạng thái dùng chung cho mọi đối tượng cần duyệt (spec §4).
export const reviewStatus = pgEnum("review_status", [
  "draft",
  "generating",
  "pending_review",
  "approved",
  "rejected",
  "failed",
]);
export const assetKind = pgEnum("asset_kind", ["chr", "bg", "prop", "fx"]);
// Video đang ở bước nào của quy trình.
export const videoStatus = pgEnum("video_status", [
  "scripting",
  "storyboarding",
  "rendering",
  "uploading",
  "done",
]);
// Loại đối tượng mà validations, reviews, job_runs trỏ tới (tham chiếu đa hình, không có khóa ngoại).
export const targetType = pgEnum("target_type", [
  "asset",
  "asset_variant",
  "video",
  "script",
  "scene",
  "render",
  "upload",
]);
export const reviewDecision = pgEnum("review_decision", ["approved", "rejected"]);
export const validationVerdict = pgEnum("validation_verdict", ["pass", "fail"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed"]);
export const privacyStatus = pgEnum("privacy_status", ["private", "unlisted", "public"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const channels = pgTable("channels", {
  id: id(),
  name: text("name").notNull().unique(),
  youtubeChannelId: text("youtube_channel_id").unique(),
  createdAt: createdAt(),
});

export const assets = pgTable(
  "assets",
  {
    id: id(),
    name: text("name").notNull().unique(),
    kind: assetKind("kind").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Chuẩn đặt tên: docs/standards/asset-naming.md
    check(
      "assets_name_format",
      sql`${t.name} ~ '^(chr|bg|prop|fx)_[a-z0-9]+(_[a-z0-9]+)*$' AND char_length(${t.name}) <= 40`,
    ),
    check("assets_name_matches_kind", sql`starts_with(${t.name}, ${t.kind}::text || '_')`),
  ],
);

export const assetVariants = pgTable(
  "asset_variants",
  {
    id: id(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // `base` = ảnh gốc đã duyệt. Danh sách trạng thái hợp lệ theo loại asset nằm ở chuẩn đặt tên, kiểm tra ở tầng app.
    state: text("state").notNull(),
    filePath: text("file_path"),
    width: integer("width"),
    height: integer("height"),
    prompt: text("prompt").notNull().default(""),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("asset_variants_asset_state").on(t.assetId, t.state),
    check("asset_variants_state_format", sql`${t.state} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
    check(
      "asset_variants_size_positive",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`,
    ),
  ],
);

// Lát cắt đầu chỉ có một combo cố định; nội dung `definition` chốt ở M4 và spec combo/ACE.
export const combos = pgTable("combos", {
  id: id(),
  name: text("name").notNull().unique(),
  definition: jsonb("definition").notNull().default({}),
  createdAt: createdAt(),
});

export const videos = pgTable("videos", {
  id: id(),
  // Có thể chưa chọn kênh khi mới tạo video; bắt buộc ở bước upload (M7).
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  brief: text("brief").notNull().default(""),
  comboId: uuid("combo_id").references(() => combos.id, { onDelete: "set null" }),
  status: videoStatus("status").notNull().default("scripting"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const scripts = pgTable(
  "scripts",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // Khuôn JSON chốt ở plan M4.
    content: jsonb("content"),
    model: text("model"),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [unique("scripts_video_version").on(t.videoId, t.version)],
);

export const scenes = pgTable(
  "scenes",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    // Thứ tự cảnh trong video ("order" là từ khóa SQL nên đặt tên position).
    position: integer("position").notNull(),
    // Khuôn JSON cảnh chốt ở plan M3.
    dsl: jsonb("dsl"),
    dslVersion: integer("dsl_version").notNull().default(1),
    durationFrames: integer("duration_frames"),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("scenes_script_position").on(t.scriptId, t.position)],
);

export const validations = pgTable(
  "validations",
  {
    id: id(),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    validatorModel: text("validator_model").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    scores: jsonb("scores").notNull(),
    verdict: validationVerdict("verdict").notNull(),
    feedback: text("feedback").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("validations_target").on(t.targetType, t.targetId)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    decision: reviewDecision("decision").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_target").on(t.targetType, t.targetId)],
);

export const renders = pgTable("renders", {
  id: id(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  filePath: text("file_path"),
  durationMs: integer("duration_ms"),
  status: reviewStatus("status").notNull().default("draft"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const uploads = pgTable("uploads", {
  id: id(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id),
  youtubeVideoId: text("youtube_video_id"),
  privacyStatus: privacyStatus("privacy_status").notNull().default("private"),
  madeForKids: boolean("made_for_kids").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  status: jobStatus("status").notNull().default("queued"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    jobType: text("job_type").notNull(),
    targetType: targetType("target_type"),
    targetId: uuid("target_id"),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    // Model đã gọi, số token, thời gian chạy... (spec §8).
    metrics: jsonb("metrics").notNull().default({}),
    queueMsgId: bigint("queue_msg_id", { mode: "number" }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("job_runs_status").on(t.status),
    index("job_runs_target").on(t.targetType, t.targetId),
    index("job_runs_created_at").on(t.createdAt),
  ],
);

export type JobRun = typeof jobRuns.$inferSelect;
```

- [ ] **Step 5: Tạo `src/lib/db/client.ts`**

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;

// pg cho các tham số ssl* trong URL ghi đè object `ssl` bên dưới, nên bỏ chúng đi.
const SSL_URL_PARAMS = ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

function createPool(): pg.Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("Thiếu DATABASE_URL (xem .env.example)");
  const url = new URL(raw);
  for (const param of SSL_URL_PARAMS) url.searchParams.delete(param);

  // pg mặc định không dùng TLS và Supabase không bắt buộc SSL: luôn bật TLS có xác minh chứng chỉ.
  // DATABASE_CA_CERT là đường dẫn tính từ thư mục chạy (gốc repo, hoặc /app trong container).
  const caPath = process.env.DATABASE_CA_CERT;
  const ssl = caPath ? { ca: readFileSync(path.resolve(caPath), "utf8") } : { rejectUnauthorized: true };

  return new pg.Pool({ connectionString: url.toString(), ssl, max: 5 });
}

// Một pool cho cả tiến trình. Lưu trên globalThis để Next dev (HMR) không tạo pool mới mỗi lần nạp lại module.
const globalForDb = globalThis as unknown as { cartoonPool?: pg.Pool; cartoonDb?: Db };

export function getPool(): pg.Pool {
  globalForDb.cartoonPool ??= createPool();
  return globalForDb.cartoonPool;
}

export function getDb(): Db {
  globalForDb.cartoonDb ??= drizzle({ client: getPool(), schema });
  return globalForDb.cartoonDb;
}
```

- [ ] **Step 6: Tạo `src/lib/db/migrate.ts`**

```ts
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { getDb, getPool } from "./client";

// Áp dụng các migration trong ./drizzle. Chạy: `npm run db:migrate` (máy dev) hoặc service `migrate` (Docker).
async function main() {
  const started = performance.now();
  try {
    await migrate(getDb(), { migrationsFolder: "drizzle" });
    console.log(`Đã áp dụng migration (${(performance.now() - started).toFixed(0)}ms)`);
  } finally {
    await getPool().end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 7: Tạo `src/lib/errors.ts`**

```ts
// Lỗi truy vấn của Drizzle chỉ ghi "Failed query: ..."; lý do thật (sai mật khẩu, lỗi TLS...) nằm ở `cause`.
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.cause instanceof Error ? `${error.cause.message} (${error.message.split("\n")[0]})` : error.message;
  }
  return String(error);
}
```

- [ ] **Step 8: Sinh migration**

```bash
npx drizzle-kit generate --name init
npx drizzle-kit generate --custom --name pgmq_jobs_queue
```

Expected: `drizzle/0000_init.sql`, `drizzle/0001_pgmq_jobs_queue.sql` (rỗng), `drizzle/meta/_journal.json` + 2 snapshot. `0000_init.sql` phải **trùng khớp** với SQL dưới đây (đây là schema cần duyệt):

```sql
CREATE TYPE "public"."asset_kind" AS ENUM('chr', 'bg', 'prop', 'fx');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('queued', 'running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."privacy_status" AS ENUM('private', 'unlisted', 'public');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('draft', 'generating', 'pending_review', 'approved', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."target_type" AS ENUM('asset', 'asset_variant', 'video', 'script', 'scene', 'render', 'upload');--> statement-breakpoint
CREATE TYPE "public"."validation_verdict" AS ENUM('pass', 'fail');--> statement-breakpoint
CREATE TYPE "public"."video_status" AS ENUM('scripting', 'storyboarding', 'rendering', 'uploading', 'done');--> statement-breakpoint
CREATE TABLE "asset_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"state" text NOT NULL,
	"file_path" text,
	"width" integer,
	"height" integer,
	"prompt" text DEFAULT '' NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_variants_asset_state" UNIQUE("asset_id","state"),
	CONSTRAINT "asset_variants_state_format" CHECK ("asset_variants"."state" ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
	CONSTRAINT "asset_variants_size_positive" CHECK (("asset_variants"."width" IS NULL OR "asset_variants"."width" > 0) AND ("asset_variants"."height" IS NULL OR "asset_variants"."height" > 0))
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"display_name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_name_unique" UNIQUE("name"),
	CONSTRAINT "assets_name_format" CHECK ("assets"."name" ~ '^(chr|bg|prop|fx)_[a-z0-9]+(_[a-z0-9]+)*$' AND char_length("assets"."name") <= 40),
	CONSTRAINT "assets_name_matches_kind" CHECK (starts_with("assets"."name", "assets"."kind"::text || '_'))
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"youtube_channel_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channels_name_unique" UNIQUE("name"),
	CONSTRAINT "channels_youtube_channel_id_unique" UNIQUE("youtube_channel_id")
);
--> statement-breakpoint
CREATE TABLE "combos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combos_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"target_type" "target_type",
	"target_id" uuid,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"queue_msg_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "renders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"file_path" text,
	"duration_ms" integer,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"decision" "review_decision" NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"script_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"dsl" jsonb,
	"dsl_version" integer DEFAULT 1 NOT NULL,
	"duration_frames" integer,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenes_script_position" UNIQUE("script_id","position")
);
--> statement-breakpoint
CREATE TABLE "scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb,
	"model" text,
	"status" "review_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scripts_video_version" UNIQUE("video_id","version")
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"youtube_video_id" text,
	"privacy_status" "privacy_status" DEFAULT 'private' NOT NULL,
	"made_for_kids" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"status" "job_status" DEFAULT 'queued' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" "target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"validator_model" text NOT NULL,
	"rubric_version" text NOT NULL,
	"scores" jsonb NOT NULL,
	"verdict" "validation_verdict" NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid,
	"title" text NOT NULL,
	"brief" text DEFAULT '' NOT NULL,
	"combo_id" uuid,
	"status" "video_status" DEFAULT 'scripting' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_variants" ADD CONSTRAINT "asset_variants_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renders" ADD CONSTRAINT "renders_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_script_id_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scripts" ADD CONSTRAINT "scripts_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_combo_id_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."combos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_runs_status" ON "job_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_runs_target" ON "job_runs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "job_runs_created_at" ON "job_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "reviews_target" ON "reviews" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "validations_target" ON "validations" USING btree ("target_type","target_id");
```

- [ ] **Step 9: Điền `drizzle/0001_pgmq_jobs_queue.sql`**

```sql
-- Hàng đợi job (pgmq, nền của Supabase Queues). Spec §3.
CREATE EXTENSION IF NOT EXISTS pgmq;--> statement-breakpoint
SELECT pgmq.create('jobs');
```

- [ ] **Step 10: Cập nhật `.env.example`**

Thay khối `# ---------- Spike M0 ...` (ở cuối file) bằng:

```dotenv
# ---------- Database (Supabase, chỉ dùng Postgres) ----------
# Supabase → Connect → Session pooler (cổng 5432). Bí mật, chỉ dùng phía server.
DATABASE_URL=
# Tùy chọn: CA cert của Supabase (Database Settings → SSL Configuration), đường dẫn tính từ gốc repo,
# vd. certs/supabase-ca.crt. Bỏ trống thì xác minh TLS bằng kho CA hệ thống.
DATABASE_CA_CERT=

# ---------- Model qua 9router ----------
# Tên model: GET <NINE_ROUTER_BASE_URL>/models và /models/image. Giám khảo phải khác họ với model viết.
LLM_WRITER_MODEL=ag/gemini-3.6-flash-medium
LLM_JUDGE_MODEL=ag/claude-sonnet-4-6
IMAGE_MODEL=ag/gemini-3.1-flash-image

# ---------- Lưu file ----------
# Thư mục ảnh, video. Bỏ trống = ./data. Trong Docker luôn là /app/data (mount ./data).
DATA_DIR=

# ---------- Spike M0 (scripts/spikes/m0, app chưa dùng) ----------
# OAuth client loại Desktop app trên Google Cloud (bật YouTube Data API v3).
YOUTUBE_OAUTH_CLIENT_ID=
YOUTUBE_OAUTH_CLIENT_SECRET=
```

Thêm các biến không bí mật còn thiếu vào `.env` của user (không in nội dung file):

```bash
for kv in LLM_WRITER_MODEL=ag/gemini-3.6-flash-medium LLM_JUDGE_MODEL=ag/claude-sonnet-4-6 IMAGE_MODEL=ag/gemini-3.1-flash-image; do k=${kv%%=*}; grep -qE "^$k=" .env || echo "$kv" >> .env; done
```

- [ ] **Step 11: Áp dụng migration lên Supabase**

Run: `npm run db:migrate`
Expected: `Đã áp dụng migration (...ms)`. Chạy lại lần hai: vẫn thành công, không tạo gì mới.

- [ ] **Step 12: Kiểm tra tĩnh**

Run: `npx tsc --noEmit` và `npm run lint`. Expected: không lỗi.

- [ ] **Step 13: Commit**

```bash
git add package.json package-lock.json drizzle.config.ts drizzle src/lib/db/schema.ts src/lib/db/client.ts src/lib/db/migrate.ts src/lib/errors.ts .env.example
git commit -m "feat(db): add drizzle schema, tls client and initial migrations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hàng đợi, lưu file, client 9router và worker

**Files:**
- Create: `src/lib/queue/jobs.ts`, `src/lib/queue/consume.ts`, `src/lib/storage/index.ts`, `src/lib/ninerouter/client.ts`, `src/worker/handlers.ts`, `src/worker/runner.ts`, `src/worker/index.ts`, `src/worker/enqueue.ts`
- Delete: `src/lib/ninerouter/config.ts`
- Modify: `package.json`, `package-lock.json` (gỡ `server-only`, thêm script)

**Interfaces:**
- Consumes: `getDb`, `getPool`, `Db` (`@/lib/db/client`); `jobRuns`, `targetType` (`@/lib/db/schema`); `errorMessage` (`@/lib/errors`).
- Produces:
  - `JOB_QUEUE`, `JOB_TYPES`, `type JobType`, `type JobMessage`, `isJobType()`, `enqueueJob(type, payload?, target?, db?): Promise<string>`, `listRecentJobs(limit?, db?)` (`@/lib/queue/jobs`)
  - `readJob`, `archiveJob`, `retryJobIn`, `queueLength(db): Promise<number>` (`@/lib/queue/consume`)
  - `dataRoot()`, `dataPath()`, `writeDataFile()`, `readDataFile()`, `dataFileInfo()` (`@/lib/storage`)
  - `chat()`, `generateImage()`, `sniffImage()`, `requireModel()` (`@/lib/ninerouter/client`)
  - `processOne(db): Promise<boolean>`, `log()` (`src/worker/runner.ts`); `handlers`, `PermanentJobError` (`src/worker/handlers.ts`)
  - Script `npm run worker`, `npm run job -- <loại>`; file `DATA_DIR/system/last-ping.json`

- [ ] **Step 1: Gỡ `server-only` và thêm script**

```bash
git rm src/lib/ninerouter/config.ts
npm uninstall server-only
```

Thêm vào `scripts` của `package.json`:

```json
"worker": "tsx --env-file=.env src/worker/index.ts",
"job": "tsx --env-file=.env src/worker/enqueue.ts"
```

- [ ] **Step 2: Tạo `src/lib/queue/jobs.ts`**

```ts
import { desc, eq, sql } from "drizzle-orm";

import { getDb, type Db } from "@/lib/db/client";
import { jobRuns, targetType } from "@/lib/db/schema";

// Một hàng đợi pgmq cho mọi loại job; loại job nằm trong message.
export const JOB_QUEUE = "jobs";

// Mỗi mốc sau thêm loại job của mình vào đây (vd. "asset.generate" ở M2).
export const JOB_TYPES = ["system.ping", "system.llm_ping"] as const;
export type JobType = (typeof JOB_TYPES)[number];
export type JobPayload = Record<string, unknown>;
export type JobTarget = { type: (typeof targetType.enumValues)[number]; id: string };
export type JobMessage = { jobRunId: string; type: JobType; payload: JobPayload };

export function isJobType(value: string): value is JobType {
  return (JOB_TYPES as readonly string[]).includes(value);
}

// Ghi job_runs và gửi message trong cùng một transaction: không có job nào nằm trong hàng đợi mà thiếu bản ghi theo dõi.
export async function enqueueJob(
  type: JobType,
  payload: JobPayload = {},
  target?: JobTarget,
  db: Db = getDb(),
): Promise<string> {
  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(jobRuns)
      .values({ jobType: type, targetType: target?.type, targetId: target?.id })
      .returning({ id: jobRuns.id });
    const message: JobMessage = { jobRunId: run.id, type, payload };
    const sent = await tx.execute<{ msg_id: string }>(
      sql`SELECT pgmq.send(${JOB_QUEUE}, ${JSON.stringify(message)}::jsonb) AS msg_id`,
    );
    await tx
      .update(jobRuns)
      .set({ queueMsgId: Number(sent.rows[0].msg_id) })
      .where(eq(jobRuns.id, run.id));
    return run.id;
  });
}

export async function listRecentJobs(limit = 50, db: Db = getDb()) {
  return db.select().from(jobRuns).orderBy(desc(jobRuns.createdAt)).limit(limit);
}
```

- [ ] **Step 3: Tạo `src/lib/queue/consume.ts`**

```ts
import { sql } from "drizzle-orm";

import type { Db } from "@/lib/db/client";

import { JOB_QUEUE } from "./jobs";

// Một bản ghi pgmq.message_record. `message` là JSON thô: worker phải tự kiểm tra trước khi tin.
export type QueueRecord = { msg_id: string; read_ct: number; message: unknown };

// Đọc 1 message và ẩn nó trong `vtSeconds`. Worker chết giữa chừng thì message tự hiện lại sau thời gian đó.
export async function readJob(db: Db, vtSeconds: number): Promise<QueueRecord | null> {
  const res = await db.execute<QueueRecord>(
    sql`SELECT msg_id, read_ct, message FROM pgmq.read(${JOB_QUEUE}, ${vtSeconds}::integer, 1)`,
  );
  return res.rows[0] ?? null;
}

export async function archiveJob(db: Db, msgId: string): Promise<void> {
  await db.execute(sql`SELECT pgmq.archive(${JOB_QUEUE}, ${msgId}::bigint)`);
}

// set_vt có bản nạp chồng (integer | timestamptz): phải ép kiểu, nếu không Postgres báo mơ hồ.
export async function retryJobIn(db: Db, msgId: string, seconds: number): Promise<void> {
  await db.execute(sql`SELECT pgmq.set_vt(${JOB_QUEUE}, ${msgId}::bigint, ${seconds}::integer)`);
}

export async function queueLength(db: Db): Promise<number> {
  const res = await db.execute<{ queue_length: string }>(
    sql`SELECT queue_length FROM pgmq.metrics(${JOB_QUEUE})`,
  );
  return Number(res.rows[0]?.queue_length ?? 0);
}
```

- [ ] **Step 4: Tạo `src/lib/storage/index.ts`**

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";

// Mọi file (ảnh asset, video render...) nằm trong DATA_DIR. Đổi sang object storage sau này chỉ cần sửa module này.
export function dataRoot(): string {
  return path.resolve(process.env.DATA_DIR || "data");
}

// Đường dẫn tương đối (dùng "/") → đường dẫn tuyệt đối trong DATA_DIR. Chặn mọi đường dẫn thoát ra ngoài.
export function dataPath(relative: string): string {
  const root = dataRoot();
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Đường dẫn nằm ngoài DATA_DIR: ${relative}`);
  }
  return full;
}

// Ghi ra file tạm rồi đổi tên: người đọc không bao giờ thấy file ghi dở.
export async function writeDataFile(relative: string, data: Buffer | string): Promise<void> {
  const target = dataPath(relative);
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, target);
}

export async function readDataFile(relative: string): Promise<Buffer> {
  return readFile(dataPath(relative));
}

export async function dataFileInfo(relative: string): Promise<Stats | null> {
  try {
    return await stat(dataPath(relative));
  } catch {
    return null;
  }
}
```

- [ ] **Step 5: Tạo `src/lib/ninerouter/client.ts`**

```ts
// Client 9router (OpenAI-compatible). Dùng chung cho app (server) và worker,
// nên không import "server-only": gói đó ném lỗi khi chạy ngoài React Server Components.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type TokenUsage = { promptTokens: number; completionTokens: number; totalTokens: number };
export type ChatResult = { content: string; model: string; usage: TokenUsage };
export type ImageFormat = { mime: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };
export type GeneratedImage = ImageFormat & { data: Buffer };

function config(): { baseUrl: string; apiKey: string } {
  const baseUrl = process.env.NINE_ROUTER_BASE_URL;
  const apiKey = process.env.NINE_ROUTER_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Thiếu NINE_ROUTER_BASE_URL hoặc NINE_ROUTER_API_KEY");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

export function requireModel(envName: "LLM_WRITER_MODEL" | "LLM_JUDGE_MODEL" | "IMAGE_MODEL"): string {
  const model = process.env[envName];
  if (!model) throw new Error(`Thiếu ${envName} (xem .env.example)`);
  return model;
}

export async function chat(input: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
  });
  if (!res.ok) throw new Error(`9router chat HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const json = (await res.json()) as {
    model?: string;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("9router chat: phản hồi không có nội dung");
  return {
    content,
    model: json.model ?? input.model,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      totalTokens: json.usage?.total_tokens ?? 0,
    },
  };
}

// Router có thể ghi Content-Type sai (M0: ghi image/png cho dữ liệu JPEG), nên đọc định dạng từ magic bytes.
export function sniffImage(buf: Buffer): ImageFormat {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  throw new Error(`Không nhận ra định dạng ảnh (4 byte đầu: ${buf.subarray(0, 4).toString("hex")})`);
}

export async function generateImage(input: {
  model: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<GeneratedImage> {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}/images/generations?response_format=binary`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: input.model, prompt: input.prompt }),
    signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
  });
  if (!res.ok) throw new Error(`9router image HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = Buffer.from(await res.arrayBuffer());
  return { data, ...sniffImage(data) };
}
```

- [ ] **Step 6: Tạo `src/worker/handlers.ts`**

```ts
import { chat, requireModel } from "@/lib/ninerouter/client";
import type { JobPayload, JobType } from "@/lib/queue/jobs";
import { writeDataFile } from "@/lib/storage";

export type JobContext = { jobRunId: string; attempt: number };
// Giá trị trả về được ghi vào job_runs.metrics.
export type JobHandler = (payload: JobPayload, ctx: JobContext) => Promise<Record<string, unknown> | void>;

// Lỗi không nên thử lại (dữ liệu sai, thiếu cấu hình...): job chuyển `failed` ngay.
export class PermanentJobError extends Error {}

export const handlers: Record<JobType, JobHandler> = {
  // Kiểm tra đường app → hàng đợi → worker → DB, và worker ghi được vào DATA_DIR.
  "system.ping": async (_payload, ctx) => {
    const at = new Date().toISOString();
    await writeDataFile("system/last-ping.json", JSON.stringify({ at, jobRunId: ctx.jobRunId }));
    return { pongAt: at };
  },

  // Kiểm tra worker gọi được 9router; ghi model và số token vào metrics.
  "system.llm_ping": async () => {
    let model: string;
    try {
      model = requireModel("LLM_WRITER_MODEL");
    } catch (error) {
      throw new PermanentJobError(error instanceof Error ? error.message : String(error));
    }
    const res = await chat({
      model,
      messages: [{ role: "user", content: "Reply with exactly one word: pong" }],
      temperature: 0,
      timeoutMs: 60_000,
    });
    return { model: res.model, reply: res.content.trim().slice(0, 50), usage: res.usage };
  },
};
```

- [ ] **Step 7: Tạo `src/worker/runner.ts`**

```ts
import { eq } from "drizzle-orm";

import type { Db } from "@/lib/db/client";
import { jobRuns } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import { archiveJob, readJob, retryJobIn } from "@/lib/queue/consume";
import { isJobType, type JobMessage } from "@/lib/queue/jobs";

import { handlers, PermanentJobError } from "./handlers";

// Job phải xong trong khoảng này; quá hạn thì coi như worker đã chết và message hiện lại cho lần thử sau.
export const VISIBILITY_TIMEOUT_SECONDS = 300;
export const MAX_ATTEMPTS = 3;
// Lần thử thứ n (n ≥ 1) thất bại thì chờ 10s · 2^(n-1) trước lần sau.
const RETRY_BASE_SECONDS = 10;

export function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }));
}

function parseMessage(raw: unknown): JobMessage | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.jobRunId !== "string" || typeof m.type !== "string" || !isJobType(m.type)) return null;
  const payload = typeof m.payload === "object" && m.payload !== null ? (m.payload as JobMessage["payload"]) : {};
  return { jobRunId: m.jobRunId, type: m.type, payload };
}

// Xử lý tối đa một job. Trả về false khi hàng đợi trống.
export async function processOne(db: Db): Promise<boolean> {
  const record = await readJob(db, VISIBILITY_TIMEOUT_SECONDS);
  if (!record) return false;

  const { msg_id: msgId, read_ct: attempt } = record;
  const job = parseMessage(record.message);
  if (!job) {
    log("job.malformed", { msgId });
    await archiveJob(db, msgId);
    return true;
  }

  const where = eq(jobRuns.id, job.jobRunId);
  await db.update(jobRuns).set({ status: "running", attempts: attempt, startedAt: new Date(), error: null }).where(where);
  log("job.start", { jobRunId: job.jobRunId, type: job.type, attempt });
  const started = performance.now();

  try {
    const metrics = (await handlers[job.type](job.payload, { jobRunId: job.jobRunId, attempt })) ?? {};
    const durationMs = Math.round(performance.now() - started);
    await db
      .update(jobRuns)
      .set({ status: "succeeded", finishedAt: new Date(), metrics: { ...metrics, durationMs } })
      .where(where);
    await archiveJob(db, msgId);
    log("job.succeeded", { jobRunId: job.jobRunId, type: job.type, durationMs });
  } catch (error) {
    const message = errorMessage(error);
    const permanent = error instanceof PermanentJobError || attempt >= MAX_ATTEMPTS;
    if (permanent) {
      await db.update(jobRuns).set({ status: "failed", finishedAt: new Date(), error: message }).where(where);
      await archiveJob(db, msgId);
      log("job.failed", { jobRunId: job.jobRunId, type: job.type, attempt, error: message });
    } else {
      const retryIn = RETRY_BASE_SECONDS * 2 ** (attempt - 1);
      await db.update(jobRuns).set({ status: "queued", error: message }).where(where);
      await retryJobIn(db, msgId, retryIn);
      log("job.retry", { jobRunId: job.jobRunId, type: job.type, attempt, retryIn, error: message });
    }
  }
  return true;
}
```

- [ ] **Step 8: Tạo `src/worker/index.ts`**

```ts
import { getDb, getPool } from "@/lib/db/client";
import { errorMessage } from "@/lib/errors";

import { log, processOne } from "./runner";

// Tiến trình worker: lấy job từ hàng đợi pgmq và xử lý tuần tự.
// Chạy: `npm run worker` (máy dev) hoặc service `worker` (Docker).
const IDLE_DELAY_MS = 1000;
const ERROR_DELAY_MS = 5000;

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    log("worker.stopping", { signal });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  log("worker.started");
  const db = getDb();
  while (!stopping) {
    try {
      const worked = await processOne(db);
      if (!worked) await sleep(IDLE_DELAY_MS);
    } catch (error) {
      // Lỗi hạ tầng (mất kết nối DB...): đợi rồi thử lại, không thoát tiến trình.
      log("worker.loop_error", { error: errorMessage(error) });
      await sleep(ERROR_DELAY_MS);
    }
  }
  await getPool().end();
  log("worker.stopped");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 9: Tạo `src/worker/enqueue.ts`**

```ts
import { getPool } from "@/lib/db/client";
import { enqueueJob, isJobType, JOB_TYPES } from "@/lib/queue/jobs";

// Đẩy một job vào hàng đợi từ dòng lệnh: `npm run job -- system.ping`
async function main() {
  const type = process.argv[2] ?? "";
  if (!isJobType(type)) {
    throw new Error(`Loại job không hợp lệ "${type}". Hợp lệ: ${JOB_TYPES.join(", ")}`);
  }
  try {
    const jobRunId = await enqueueJob(type);
    console.log(`Đã xếp hàng ${type}: job_runs.id = ${jobRunId}`);
  } finally {
    await getPool().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 10: Kiểm tra tĩnh**

Run: `npx tsc --noEmit` và `npm run lint`. Expected: không lỗi.

- [ ] **Step 11: Chạy thật với Supabase** (tốn 1 lời gọi chat rất ngắn)

```bash
npm run job -- system.ping
npm run job -- system.llm_ping
npm run job -- khong.ton.tai
```

Expected: hai dòng `Đã xếp hàng ...`, lệnh thứ ba báo `Loại job không hợp lệ` và thoát mã 1.

Chạy worker 30 giây rồi để `timeout` dừng nó:

Run: `timeout 30 npm run worker`
Expected (log JSON):
- `job.succeeded` cho `system.ping`, và có file `data/system/last-ping.json`;
- `job.succeeded` cho `system.llm_ping`, metrics có `model`, `reply` và `usage`.

(Việc dừng êm khi nhận SIGTERM được kiểm tra ở Task 5 trong Docker; trên Windows, tín hiệu đi qua `npm` không tới được tiến trình con.)

Nếu `llm_ping` thất bại vì model, đổi `LLM_WRITER_MODEL` trong `.env` sang một model có trong `GET <NINE_ROUTER_BASE_URL>/models`, đẩy job lại.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json src/lib/queue/jobs.ts src/lib/queue/consume.ts src/lib/storage/index.ts src/lib/ninerouter/client.ts src/worker/handlers.ts src/worker/runner.ts src/worker/index.ts src/worker/enqueue.ts
git commit -m "feat(worker): add pgmq job worker, storage and 9router client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` ở Step 1 đã stage việc xóa `src/lib/ninerouter/config.ts`.)

---

### Task 4: Khung giao diện 7 bước, bỏ client Supabase

**Files:**
- Create: `src/lib/pipeline/steps.ts`, `src/lib/format.ts`, `src/lib/system/status.ts`, `src/app/actions.ts`, `src/components/app-sidebar.tsx`, `src/components/job-buttons.tsx`, `src/components/refresh-button.tsx`, `src/app/jobs/page.tsx`
- Modify (thay toàn bộ): `src/app/layout.tsx`, `src/app/page.tsx`
- Delete: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/config.ts`
- Modify: `package.json`, `package-lock.json`, `.env.example`

**Interfaces:**
- Consumes: `getDb` (`@/lib/db/client`); `JobRun` (`@/lib/db/schema`); `errorMessage` (`@/lib/errors`); `enqueueJob`, `listRecentJobs`, `type JobType` (`@/lib/queue/jobs`); `queueLength` (`@/lib/queue/consume`); `dataFileInfo` (`@/lib/storage`).
- Produces:
  - `PIPELINE_STEPS`, `type PipelineStep` (`@/lib/pipeline/steps`): các mốc sau bật bước bằng cách thêm `href`.
  - `getSystemStatus(): Promise<SystemStatus>`, `type Check` (`@/lib/system/status`)
  - `pingWorker()`, `pingNineRouter()`, `type EnqueueResult` (`@/app/actions`)
  - Trang `/` (Tổng quan), `/jobs`

- [ ] **Step 1: Gỡ Supabase và cập nhật script**

```bash
git rm src/lib/supabase/client.ts src/lib/supabase/server.ts src/lib/supabase/config.ts
npm uninstall @supabase/ssr @supabase/supabase-js
```

Trong `package.json`, sửa 2 script (chỉ nghe máy này vì chưa có đăng nhập):

```json
"dev": "next dev --turbopack -H 127.0.0.1",
"start": "next start -H 127.0.0.1",
```

Trong `.env.example`, xóa khối đầu file từ dòng `# Project URL, dạng https://<project-ref>.supabase.co` tới hết dòng `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=` (5 dòng, kể cả 2 dòng chú thích về publishable key).

- [ ] **Step 2: Tạo `src/lib/pipeline/steps.ts`**

```ts
// 7 bước của quy trình (spec §5). Mỗi mốc làm xong bước nào thì bật `href` của bước đó.
export type PipelineStep = {
  number: number;
  title: string;
  description: string;
  // Mốc triển khai bước này (spec §11).
  milestone: string;
  // Có href nghĩa là đã dùng được.
  href?: string;
  hidden?: boolean;
};

export const PIPELINE_STEPS: readonly PipelineStep[] = [
  { number: 1, title: "Assets", description: "Sinh và duyệt nhân vật, bối cảnh, đạo cụ", milestone: "M2" },
  { number: 2, title: "Kịch bản", description: "Viết kịch bản, thả miếng hài", milestone: "M4" },
  { number: 3, title: "Phân cảnh", description: "Viết JSON phân cảnh, giám khảo chấm", milestone: "M5" },
  { number: 4, title: "Sinh cảnh", description: "Xem trước cảnh bằng Remotion", milestone: "M3" },
  { number: 5, title: "Âm thanh", description: "Tạm ẩn, lồng tiếng làm sau", milestone: "Sau lát cắt đầu", hidden: true },
  { number: 6, title: "Ghép video", description: "Render toàn tập ra MP4", milestone: "M6" },
  { number: 7, title: "Upload", description: "Duyệt và upload YouTube", milestone: "M7" },
];
```

- [ ] **Step 3: Tạo `src/lib/format.ts`**

```ts
// Thời gian tương đối ("3 phút trước") để không phụ thuộc múi giờ của server (container chạy UTC).
export function timeAgo(date: Date | null, now: Date = new Date()): string {
  if (!date) return "—";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 5) return "vừa xong";
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}
```

- [ ] **Step 4: Tạo `src/lib/system/status.ts`**

```ts
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { queueLength } from "@/lib/queue/consume";
import { dataFileInfo } from "@/lib/storage";

export type Check = { ok: boolean; detail: string };
export type SystemStatus = { database: Check; queue: Check; nineRouter: Check; lastPing: Check };

export async function getSystemStatus(): Promise<SystemStatus> {
  let database: Check;
  let queue: Check;
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    database = { ok: true, detail: "Kết nối được" };
    queue = { ok: true, detail: `${await queueLength(db)} job đang chờ` };
  } catch (error) {
    database = { ok: false, detail: errorMessage(error) };
    queue = { ok: false, detail: "Chưa kiểm tra được (DB lỗi)" };
  }

  // Chỉ kiểm tra cấu hình; muốn gọi thật thì bấm "Kiểm tra 9router" (job system.llm_ping).
  const nineRouterReady = Boolean(process.env.NINE_ROUTER_BASE_URL && process.env.NINE_ROUTER_API_KEY);
  const nineRouter: Check = nineRouterReady
    ? { ok: true, detail: "Đã cấu hình" }
    : { ok: false, detail: "Thiếu NINE_ROUTER_BASE_URL / NINE_ROUTER_API_KEY" };

  // File do job system.ping ghi: chứng minh worker và app dùng chung DATA_DIR.
  const ping = await dataFileInfo("system/last-ping.json");
  const lastPing: Check = ping
    ? { ok: true, detail: timeAgo(ping.mtime) }
    : { ok: false, detail: "Chưa có, bấm Ping worker" };

  return { database, queue, nineRouter, lastPing };
}
```

- [ ] **Step 5: Tạo `src/app/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";

import { errorMessage } from "@/lib/errors";
import { enqueueJob, type JobType } from "@/lib/queue/jobs";

export type EnqueueResult = { ok: true; jobRunId: string } | { ok: false; error: string };

async function enqueue(type: JobType): Promise<EnqueueResult> {
  try {
    const jobRunId = await enqueueJob(type);
    revalidatePath("/");
    revalidatePath("/jobs");
    return { ok: true, jobRunId };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function pingWorker(): Promise<EnqueueResult> {
  return enqueue("system.ping");
}

export async function pingNineRouter(): Promise<EnqueueResult> {
  return enqueue("system.llm_ping");
}
```

- [ ] **Step 6: Tạo `src/components/app-sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { PIPELINE_STEPS } from "@/lib/pipeline/steps";
import { cn } from "@/lib/utils";

const MAIN_LINKS = [
  { href: "/", label: "Tổng quan" },
  { href: "/jobs", label: "Jobs" },
];

const linkClass = "rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function AppSidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground">
      <Link href="/" className="px-2 text-lg font-semibold">
        Cartoon
      </Link>

      <nav className="flex flex-col gap-1">
        {MAIN_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(linkClass, isActive(link.href) && "bg-sidebar-accent font-medium")}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-1">
        <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Quy trình</p>
        {PIPELINE_STEPS.map((step) =>
          step.href ? (
            <Link
              key={step.number}
              href={step.href}
              className={cn(linkClass, isActive(step.href) && "bg-sidebar-accent font-medium")}
            >
              {step.number}. {step.title}
            </Link>
          ) : (
            <span
              key={step.number}
              className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground"
              title={step.description}
            >
              <span>
                {step.number}. {step.title}
              </span>
              <span className="text-xs">{step.hidden ? "ẩn" : step.milestone}</span>
            </span>
          ),
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 7: Tạo `src/components/job-buttons.tsx`**

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { pingNineRouter, pingWorker, type EnqueueResult } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function JobButtons() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function run(action: () => Promise<EnqueueResult>, label: string) {
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? `Đã xếp hàng "${label}".` : `Lỗi: ${result.error}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(pingWorker, "Ping worker")}>
          Ping worker
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => run(pingNineRouter, "Kiểm tra 9router")}>
          Kiểm tra 9router
        </Button>
      </div>
      {message && (
        <p className="text-sm text-muted-foreground">
          {message}{" "}
          <Link href="/jobs" className="underline underline-offset-4">
            Xem trang Jobs
          </Link>
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Tạo `src/components/refresh-button.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? "Đang tải..." : "Làm mới"}
    </Button>
  );
}
```

- [ ] **Step 9: Thay toàn bộ `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { AppSidebar } from "@/components/app-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cartoon",
  description: "Quy trình làm phim hoạt hình 2D cho YouTube",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
        <div className="flex min-h-screen">
          <AppSidebar />
          <main className="min-w-0 flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
```

- [ ] **Step 10: Thay toàn bộ `src/app/page.tsx`**

```tsx
import Link from "next/link";

import { JobButtons } from "@/components/job-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PIPELINE_STEPS } from "@/lib/pipeline/steps";
import { getSystemStatus, type Check } from "@/lib/system/status";

export const dynamic = "force-dynamic";

function StatusRow({ label, check }: { label: string; check: Check }) {
  return (
    <li className="flex items-start justify-between gap-4 text-sm">
      <span>{label}</span>
      <span className={check.ok ? "text-right text-green-600" : "text-right break-all text-destructive"}>
        {check.detail}
      </span>
    </li>
  );
}

export default async function Home() {
  const status = await getSystemStatus();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Tổng quan</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hệ thống</CardTitle>
            <CardDescription>Postgres (Supabase), hàng đợi pgmq, 9router, worker</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              <StatusRow label="Database" check={status.database} />
              <StatusRow label="Hàng đợi" check={status.queue} />
              <StatusRow label="9router" check={status.nineRouter} />
              <StatusRow label="Ping worker gần nhất" check={status.lastPing} />
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kiểm tra nhanh</CardTitle>
            <CardDescription>Đẩy job vào hàng đợi rồi xem kết quả ở trang Jobs</CardDescription>
          </CardHeader>
          <CardContent>
            <JobButtons />
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Quy trình 7 bước</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.map((step) => (
            <Card key={step.number} className={step.href ? undefined : "opacity-60"}>
              <CardHeader>
                <CardTitle>
                  {step.href ? (
                    <Link href={step.href} className="hover:underline">
                      {step.number}. {step.title}
                    </Link>
                  ) : (
                    <>
                      {step.number}. {step.title}
                    </>
                  )}
                </CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {step.href ? "Đang dùng được" : step.hidden ? "Tạm ẩn" : `Có từ mốc ${step.milestone}`}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 11: Tạo `src/app/jobs/page.tsx`**

```tsx
import { RefreshButton } from "@/components/refresh-button";
import { Card, CardContent } from "@/components/ui/card";
import type { JobRun } from "@/lib/db/schema";
import { errorMessage } from "@/lib/errors";
import { timeAgo } from "@/lib/format";
import { listRecentJobs } from "@/lib/queue/jobs";

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<JobRun["status"], string> = {
  queued: "text-muted-foreground",
  running: "text-blue-600",
  succeeded: "text-green-600",
  failed: "text-destructive",
};

export default async function JobsPage() {
  let jobs: JobRun[] = [];
  let loadError: string | null = null;
  try {
    jobs = await listRecentJobs(50);
  } catch (error) {
    loadError = errorMessage(error);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <RefreshButton />
      </div>

      {loadError ? (
        <Card>
          <CardContent className="text-sm break-all text-destructive">Không đọc được job_runs: {loadError}</CardContent>
        </Card>
      ) : jobs.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">Chưa có job nào.</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Tạo lúc</th>
                <th className="px-3 py-2 font-medium">Loại</th>
                <th className="px-3 py-2 font-medium">Trạng thái</th>
                <th className="px-3 py-2 font-medium">Lần thử</th>
                <th className="px-3 py-2 font-medium">Kết quả</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{timeAgo(job.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{job.jobType}</td>
                  <td className={`px-3 py-2 ${STATUS_CLASS[job.status]}`}>{job.status}</td>
                  <td className="px-3 py-2">{job.attempts}</td>
                  <td className="px-3 py-2 font-mono text-xs break-all">
                    {job.error ? (
                      <span className="text-destructive">{job.error}</span>
                    ) : (
                      JSON.stringify(job.metrics)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Kiểm tra tĩnh và build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`
Expected: không lỗi; bảng route có `ƒ /`, `ƒ /api/health`, `ƒ /jobs`. Không còn chuỗi `supabase` trong `src/` (`grep -ri supabase src` không ra kết quả nào ngoài chữ "Supabase" trong mô tả thẻ Hệ thống).

- [ ] **Step 13: Chạy thử trên máy dev**

Kiểm tra cổng 3000 trống (`curl -s -m 2 127.0.0.1:3000 >/dev/null && echo "đang dùng"`). Nếu đang dùng, thêm `-- -p 3001` vào lệnh `npm run dev` và đổi URL bên dưới.

Run (2 terminal): `npm run worker` và `npm run dev`
Mở http://127.0.0.1:3000 bằng trình duyệt tích hợp:
- Thẻ Hệ thống: Database "Kết nối được", Hàng đợi "0 job đang chờ", 9router "Đã cấu hình".
- Menu bên có 7 bước kèm mốc (M2, M4, M5, M3, ẩn, M6, M7).
- Bấm **Ping worker** → hiện "Đã xếp hàng". Tải lại trang: "Ping worker gần nhất" = "vừa xong".
- Trang **Jobs**: có `system.ping` ở trạng thái `succeeded`.

Dừng cả hai tiến trình (Ctrl+C).

- [ ] **Step 14: Commit (2 commit theo scope)**

```bash
git add package.json package-lock.json .env.example
git commit -m "refactor(app): drop supabase client in favor of direct postgres

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git add src/lib/pipeline/steps.ts src/lib/format.ts src/lib/system/status.ts src/app/actions.ts src/components/app-sidebar.tsx src/components/job-buttons.tsx src/components/refresh-button.tsx src/app/layout.tsx src/app/page.tsx src/app/jobs/page.tsx
git commit -m "feat(ui): add app shell with 7-step navigation and jobs page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` ở Step 1 đã stage việc xóa `src/lib/supabase/*`; nó đi vào commit đầu cùng `package.json`.)

---

### Task 5: Docker: migrate, worker, app

**Files:**
- Modify (thay toàn bộ): `Dockerfile`, `docker-compose.yml`
- Modify: `.dockerignore`

**Interfaces:**
- Consumes: `src/lib/db/migrate.ts`, `src/worker/index.ts`, `drizzle/`, biến môi trường của Task 2–3.
- Produces: `docker compose up -d --build` chạy `migrate` → `worker` + `app`; target `worker` và `runner` trong `Dockerfile`.

- [ ] **Step 1: Thay toàn bộ `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

# ===== worker + migrate: Debian (Remotion ở M6 không chạy tốt trên Alpine) =====
FROM node:22-bookworm-slim AS worker-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=worker-deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY drizzle ./drizzle
COPY src ./src
USER node
CMD ["node_modules/.bin/tsx", "src/worker/index.ts"]

# ===== app Next.js: Alpine, bản standalone (stage cuối = mặc định của `docker build`) =====
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run lint && npm run build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 2: Thay toàn bộ `docker-compose.yml`**

```yaml
# Chạy toàn bộ hệ thống bằng MỘT lệnh:
#
#   cp .env.example .env      # lần đầu; điền DATABASE_URL và 9router (xem README.md)
#   docker compose up -d --build
#
# migrate chạy migration rồi thoát; sau đó worker và app khởi động.
# App: http://127.0.0.1:3000 (chỉ nghe trên máy này vì chưa có đăng nhập).
# Dừng: docker compose down

name: cartoon

x-runtime-env: &runtime-env
  DATABASE_URL: "${DATABASE_URL:?thiếu DATABASE_URL trong .env - xem README.md}"
  DATABASE_CA_CERT: ${DATABASE_CA_CERT:-}
  DATA_DIR: /app/data
  NINE_ROUTER_BASE_URL: ${NINE_ROUTER_BASE_URL:-}
  NINE_ROUTER_API_KEY: ${NINE_ROUTER_API_KEY:-}
  LLM_WRITER_MODEL: ${LLM_WRITER_MODEL:-}
  LLM_JUDGE_MODEL: ${LLM_JUDGE_MODEL:-}
  IMAGE_MODEL: ${IMAGE_MODEL:-}

# App và worker dùng chung ./data (ảnh, video) và ./certs (CA cert của Supabase, nếu cần).
x-runtime-volumes: &runtime-volumes
  - ./data:/app/data
  - ./certs:/app/certs:ro

services:
  migrate:
    build:
      context: .
      target: worker
    command: ["node_modules/.bin/tsx", "src/lib/db/migrate.ts"]
    environment: *runtime-env
    volumes: *runtime-volumes
    restart: "no"

  worker:
    build:
      context: .
      target: worker
    restart: unless-stopped
    environment: *runtime-env
    volumes: *runtime-volumes
    depends_on:
      migrate:
        condition: service_completed_successfully

  app:
    build:
      context: .
      target: runner
    restart: unless-stopped
    ports:
      - "127.0.0.1:${APP_PORT:-3000}:3000"
    environment: *runtime-env
    volumes: *runtime-volumes
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    depends_on:
      migrate:
        condition: service_completed_successfully
```

- [ ] **Step 3: Thêm `certs` vào `.dockerignore`**

Thêm dòng `certs` ngay sau dòng `scripts` (cert được mount lúc chạy, không đóng vào image).

- [ ] **Step 4: Chạy cả hệ thống**

Run: `docker compose config --quiet` → không lỗi.
Run: `docker compose up -d --build`
Expected: `migrate` Exited (0); `worker` Up; `app` Up (healthy).

- [ ] **Step 5: Kiểm tra end-to-end**

- Mở http://127.0.0.1:3000 (trình duyệt tích hợp): Database "Kết nối được".
- Bấm **Ping worker**, tải lại: "Ping worker gần nhất" = "vừa xong". File `data/system/last-ping.json` trên máy host được cập nhật (app và worker dùng chung volume).
- `docker compose logs worker` có `job.succeeded`.
- Dừng êm: `docker compose stop worker`, rồi `docker compose logs worker | tail -2` → `worker.stopping` (SIGTERM) và `worker.stopped`.
- `docker compose down`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "build(docker): run migrate, worker and app with compose

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tài liệu

**Files:**
- Modify (thay toàn bộ): `README.md`
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md`

- [ ] **Step 1: Thay toàn bộ `README.md`**

````markdown
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
   - `DATABASE_URL`: Supabase dashboard → **Connect** → **Session pooler** (cổng 5432), chuỗi đã có mật khẩu DB.
   - `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY`: 9router (URL thường kết thúc bằng `/v1`).
   - `LLM_WRITER_MODEL`, `LLM_JUDGE_MODEL`, `IMAGE_MODEL`: tên model trên 9router; giám khảo phải khác họ với model viết.
3. Kết nối Postgres luôn dùng TLS có xác minh chứng chỉ. Nếu báo lỗi chứng chỉ: tải CA cert ở Supabase **Database Settings → SSL Configuration**, lưu thành `certs/supabase-ca.crt` và đặt `DATABASE_CA_CERT=certs/supabase-ca.crt`.

Mọi biến đều đọc lúc chạy: sửa `.env` xong chỉ cần `docker compose up -d`.

## Chạy bằng Docker

```bash
docker compose up -d --build
```

Mở http://127.0.0.1:3000 → **Tổng quan** → bấm **Ping worker**; trang **Jobs** phải có `system.ping` ở trạng thái `succeeded`.

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
| `src/lib/pipeline/steps.ts` | 7 bước quy trình, dùng cho menu và trang Tổng quan |
| `src/worker/` | Tiến trình worker và handler từng loại job |
| `drizzle/` | File migration SQL (commit vào repo) |
| `scripts/spikes/` | Code thử nghiệm M0, không dùng trong app |
````

- [ ] **Step 2: Cập nhật `CLAUDE.md`**

Trong bảng "Thông tin repo", thay dòng `| `@supabase/supabase-js` / `@supabase/ssr` | 2.118.0 / 0.12.7 |` bằng:

```markdown
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 |
| pg / tsx | 8.23.1 / 4.23.15 |
```

và thay dòng `| Node: máy dev / image Docker | 24.15.0 / `node:22-alpine` |` bằng:

```markdown
| Node: máy dev / image app / image worker | 24.15.0 / `node:22-alpine` / `node:22-bookworm-slim` |
```

Thay câu `Không có test runner (và agent không được tự thêm hay chạy test, xem AGENTS.md), không có thư mục `supabase/` (chưa có migration hay schema), không có `middleware.ts`.` bằng:

```markdown
Không có test runner (và agent không được tự thêm hay chạy test, xem AGENTS.md), không có `middleware.ts`. Migration nằm ở `drizzle/`.
```

Thay khối lệnh đầu của mục "Lệnh thường dùng" bằng:

````markdown
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
````

Trong khối lệnh Docker của mục đó, thay dòng `docker compose up -d --build   # build và chạy app tại :3000` bằng `docker compose up -d --build   # migrate rồi chạy worker + app (127.0.0.1:3000)`.

Thay toàn bộ mục `## Kiến trúc` bằng:

```markdown
## Kiến trúc

- **Supabase chỉ dùng Postgres.** App (server) và worker kết nối thẳng qua `DATABASE_URL` (Session pooler) bằng `pg` + Drizzle (`src/lib/db/client.ts`, một pool cho cả tiến trình, lưu trên `globalThis` cho Next dev). Luôn bật TLS có xác minh; tham số `sslmode`/`ssl*` trong URL bị bỏ vì `pg` cho chúng ghi đè object `ssl`; `DATABASE_CA_CERT` (đường dẫn tương đối, vd. `certs/supabase-ca.crt`) khi kho CA hệ thống không đủ. Trình duyệt không gọi DB.
- **Schema:** `src/lib/db/schema.ts`; migration trong `drizzle/` sinh bằng `drizzle-kit generate`, áp dụng bằng `src/lib/db/migrate.ts` (`npm run db:migrate` hoặc service `migrate`). Đổi schema cần spec được duyệt (AGENTS.md luật 3). Lỗi truy vấn của Drizzle giấu lý do thật trong `cause`: dùng `errorMessage()` (`src/lib/errors.ts`).
- **Job:** một hàng đợi pgmq tên `jobs`. `enqueueJob()` (`src/lib/queue/jobs.ts`) ghi `job_runs` và `pgmq.send` trong cùng transaction. Worker (`src/worker/runner.ts`, `processOne`) đọc với thời gian ẩn 300 s, thử lại sau 10 s rồi 20 s, `failed` ở lần thứ 3; `PermanentJobError` để thất bại ngay. Thêm loại job = thêm vào `JOB_TYPES` và `handlers` (`src/worker/handlers.ts`). `pgmq.set_vt` có bản nạp chồng nên tham số phải ép kiểu `::integer`.
- **Code dùng chung app + worker không import `server-only`** (gói này ném lỗi ngoài React Server Components).
- **File:** `src/lib/storage` đọc ghi trong `DATA_DIR` (mặc định `./data`; `/app/data` trong container, compose mount `./data`), chặn đường dẫn thoát ra ngoài, ghi file tạm rồi đổi tên.
- **9router:** `src/lib/ninerouter/client.ts`: chat qua `/chat/completions` (OpenAI), ảnh qua `/images/generations?response_format=binary`. Router có thể ghi `Content-Type` sai, nên định dạng ảnh đọc bằng `sniffImage()`. Router chạy trên máy host mà app chạy trong Docker: dùng `host.docker.internal`.
- **Giao diện:** menu bên và trang Tổng quan dựng từ `PIPELINE_STEPS` (`src/lib/pipeline/steps.ts`); một bước dùng được khi mốc của nó thêm `href`. Trang dùng DB phải `export const dynamic = "force-dynamic"` (build không có DB).
- **Biến môi trường:** chỉ có biến phía server, đọc lúc chạy. Thêm biến mới phải sửa đồng bộ `.env.example` và anchor `x-runtime-env` trong `docker-compose.yml`.
- **Docker:** `Dockerfile` có target `worker` (Debian, `npm ci --omit=dev`, chạy bằng `tsx`) dùng cho service `migrate` và `worker`, và target `runner` (Alpine, Next standalone; `builder` chạy `npm run lint && npm run build`) cho `app`. `runner` là stage cuối nên là mặc định của `docker build`. App chỉ map `127.0.0.1:${APP_PORT}`.
- **shadcn:** `src/lib/utils.ts` chỉ `export { cn } from "cn"` (gói npm `cn` của shadcn), alias `@/*` trỏ vào `src/*`.
```

- [ ] **Step 3: Cập nhật spec theo các khác biệt đã duyệt**

Trong `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md`:
- §4, dòng `videos`: `channel_id` (cho phép NULL), `status` = `scripting/storyboarding/rendering/uploading/done`.
- §4, dòng `scenes`: `order` → `position`.
- §4, dòng `renders`: `duration` → `duration_ms`.
- §4, dòng `uploads`: thêm "`status` dùng `job_status`".
- §4, dòng `job_runs`: thêm `queue_msg_id`, `created_at`; `target_type/target_id` cho phép NULL.
- §3, gạch "Docker Compose có 2 service": đổi thành 3 service, thêm `migrate` (chạy migration rồi thoát); worker chạy bằng `tsx`.
- §9, dòng `DATABASE_URL`: thêm "`DATABASE_CA_CERT` tùy chọn (đường dẫn, vd. `certs/supabase-ca.crt`)"; dòng `DATA_DIR`: "mặc định `./data`, `/app/data` trong container".
- §12, dòng "Công cụ ORM và migration": đổi trạng thái thành "Đã xác minh: Drizzle 0.45.4 + drizzle-kit 0.31.11 (M1)".

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md
git commit -m "docs: update readme, claude.md and spec for m1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
