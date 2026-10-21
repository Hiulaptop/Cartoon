# Bộ phim, Project thư mục và Bản thiết kế — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm tầng bộ phim (series) sở hữu asset, project dạng thư mục lồng nhau (composite) và bản thiết kế (design = `videos`) chọn một bộ phim rồi chạy các bước kịch bản, phân cảnh, render, upload bên trong trang design.

**Architecture:** Hai bảng mới (`series`, `projects` tự tham chiếu) và hai cột bắt buộc mới ở `assets` (`series_id`) và `videos` (`series_id`, `project_id`). Mọi truy vấn danh mục asset nhận `seriesId` lấy từ design. Cây project dựng trong bộ nhớ theo composite pattern (`ProjectNode`/`DesignNode`); duyệt tổ tiên/hậu duệ bằng recursive CTE (SQL thuần). Các trang cũ chuyển thành route dưới `/series/[seriesId]` (bước 1) và `/designs/[id]/...` (bước 2–7). Migration **xóa sạch dữ liệu thử** trước khi thêm cột `NOT NULL`.

**Tech Stack:** M1–M7 hiện có (Next.js 15.5.28, Drizzle 0.45.4 + drizzle-kit 0.31.11, pg, pgmq). Không thêm thư viện mới.

**Spec:** `docs/superpowers/specs/2026-10-21-series-project-design.md` (gốc: `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md`)

## Global Constraints

- Không có test tự động (AGENTS.md luật 4–6). Xác minh bằng `tsc`, lint, build và chạy thật.
- **Schema đã được duyệt qua spec** (luật 3). Plan này chỉ làm đúng schema trong spec §3; muốn thêm cột/bảng khác phải xin lại.
- **Migration phá hủy dữ liệu (spec §7, quyết định 5):** xóa 2 asset, 1 video, 6 cảnh, 1 render thử, hàng đợi pgmq và checkpoint LangGraph. Ảnh đã sinh (tốn credit) mất. Duyệt plan này = đồng ý bước đó ở Task 1.
- Giữ nguyên các hợp đồng JSON (kịch bản, cảnh, combo), pgmq, worker runner, storage (`data/assets/<assetId>/...`), 9router, Remotion, YouTube.
- Tên asset theo `docs/standards/asset-naming.md`, nhưng **duy nhất trong từng bộ phim** (Task 1 cập nhật tài liệu).
- Docker: trước khi chạy worker cục bộ phải `docker compose down` (container cũ `unless-stopped` tự bật lại và nuốt job vì thiếu handler; đã gặp ở M2/M5).
- Trong khoảng giữa Task 1 và Task 4 các trang `/videos`, `/scenes`, `/render`, `/upload` cũ không dùng được (thiếu `seriesId`/`projectId`); chỉ kiểm tĩnh trong thời gian đó.
- Commit theo luật 7, kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Nguồn đã tra (luật 1) — ngày 2026-10-21

| Nội dung | Nguồn | Kết luận |
|---|---|---|
| Khóa ngoại tự tham chiếu: `references((): AnyPgColumn => projects.id)` hoặc `foreignKey({ columns, foreignColumns })`; `unique().on(a, b)`; `uniqueIndex(name).on(...)` | context7 `/websites/orm_drizzle_team` (indexes-constraints) | Dùng `AnyPgColumn` |
| Unique index có điều kiện (`WHERE`) trong Drizzle | Tài liệu chỉ cho ví dụ index biểu thức `sql\`lower(...)\``; **chưa thấy ví dụ `.where()` trong kết quả tra** | **Rủi ro:** Task 1 bước 3 kiểm tra SQL do `drizzle-kit generate` sinh ra; nếu thiếu `WHERE`, tự thêm vào file migration (xem bước đó) |
| Recursive CTE | Chuẩn PostgreSQL (`WITH RECURSIVE`); Drizzle không có API riêng trong kết quả tra | SQL thuần qua `db.execute(sql\`...\`)`, kiểm chứng khi chạy thật |
| `drizzle-kit generate --name <tên>` sinh SQL từ `schema.ts` | `drizzle.config.ts` hiện có + tài liệu drizzle-kit | Dùng; có thể hỏi tương tác khi nghi ngờ đổi tên cột: chọn "create" |

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/db/schema.ts` (sửa) | Bảng `series`, `projects`; cột mới của `assets`, `videos` |
| `drizzle/00NN_series_projects.sql` (sinh + sửa tay) | DELETE dữ liệu thử rồi đổi cấu trúc |
| `src/lib/form.ts` (mới) | `FormState` dùng chung (hiện nằm ở `src/app/assets/actions.ts`) |
| `src/lib/scene/catalog.ts` (sửa) | `loadApprovedCatalog(seriesId)` |
| `src/worker/{asset,script,scene,render}-jobs.ts` (sửa) | Lấy `series_id`; tên asset duy nhất theo bộ phim |
| `src/lib/series/queries.ts`, `src/app/series/actions.ts` (mới) | Bộ phim: đọc, tạo, đổi tên, xóa |
| `src/app/series/asset-actions.ts` (chuyển từ `app/assets/actions.ts`) | Tạo/duyệt/loại asset, có `seriesId` |
| `src/lib/assets/queries.ts` (sửa) | `listAssets(seriesId)`, `listPendingAssetJobs(seriesId)` |
| `src/app/series/page.tsx`, `[seriesId]/page.tsx`, `[seriesId]/assets/[assetId]/page.tsx` | Danh sách bộ phim; bước 1; chi tiết asset |
| `src/lib/project/tree.ts` (mới) | Composite: `TreeNode`, `ProjectNode`, `DesignNode`, `buildTree` |
| `src/lib/project/queries.ts` (mới) | Đọc cây, tổ tiên, hậu duệ (CTE) |
| `src/app/projects/actions.ts` (mới) | Tạo, đổi tên, di chuyển (chống vòng lặp), xóa project |
| `src/app/projects/page.tsx`, `[id]/page.tsx` (mới) | Cây gốc; một thư mục |
| `src/app/designs/actions.ts` (chuyển từ `app/videos/actions.ts`) | `createDesign`, duyệt/loại/viết lại kịch bản |
| `src/app/designs/[id]/layout.tsx`, `page.tsx`, `storyboard/`, `render/`, `upload/` | Trang design và các bước |
| `src/components/app-sidebar.tsx`, `src/app/page.tsx`, `src/lib/pipeline/steps.ts` (sửa) | Menu mới, Tổng quan |
| `src/app/scenes/actions.ts`, `playground/page.tsx`, `playground-form.tsx` (sửa) | Sân thử chọn bộ phim |

---

### Task 1: Schema, migration xóa dữ liệu thử, và thu hẹp phạm vi theo bộ phim ở tầng lõi

**Files:**
- Create: `src/lib/form.ts`, `drizzle/00NN_series_projects.sql` (tên do drizzle-kit sinh)
- Modify: `src/lib/db/schema.ts`, `src/lib/scene/catalog.ts`, `src/worker/asset-jobs.ts`, `src/worker/script-jobs.ts`, `src/worker/scene-jobs.ts`, `src/worker/render-jobs.ts`, `src/app/videos/actions.ts`, `docs/standards/asset-naming.md`
- Sửa import `FormState` ở: `src/app/{videos,scenes,render,upload}/*.ts(x)` và `src/components/**`

**Interfaces:**
- Produces: bảng `series`, `projects`; `assets.seriesId`, `videos.seriesId`, `videos.projectId`; `type FormState = { error?: string }` ở `@/lib/form`; `loadApprovedCatalog(seriesId: string): Promise<Catalog>`; payload job `asset.generate_base` có `seriesId: string`.

- [ ] **Step 1: Tạo `src/lib/form.ts` và đổi mọi import `FormState`**

```ts
// Trạng thái trả về của các server action dùng với useActionState.
export type FormState = { error?: string };
```

Trong `src/app/assets/actions.ts` đổi `export type FormState = { error?: string };` thành `export type { FormState } from "@/lib/form";` và thêm `import type { FormState } from "@/lib/form";`. Rồi đổi ở các file khác:

```bash
grep -rl 'from "@/app/assets/actions"' src | xargs grep -l "FormState" 
```

Với các file **không** phải component asset (nghĩa là `src/app/{videos,scenes,render,upload}/*.ts`, `src/components/{videos,scene,render,upload}/*.tsx`), thay `import type { FormState } from "@/app/assets/actions";` bằng `import type { FormState } from "@/lib/form";`. (Component asset sẽ đổi ở Task 2.)

- [ ] **Step 2: Sửa `src/lib/db/schema.ts`**

Sửa import đầu file thêm `type AnyPgColumn` và `uniqueIndex`:

```ts
import {
  type AnyPgColumn,
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
```

Thêm **trước** `export const assets` (ngay sau `channels`):

```ts
// Bộ phim hoạt hình: chỉ có tên. Sở hữu asset; mỗi design chọn đúng một bộ phim.
export const series = pgTable("series", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

// Thư mục (composite): parent_id NULL = project gốc. Không xóa được khi còn node con.
export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => projects.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    // NULL khác nhau trong UNIQUE, nên tách hai chỉ mục từng phần: anh em cùng cha và project gốc.
    uniqueIndex("projects_sibling_name").on(t.parentId, t.name).where(sql`${t.parentId} IS NOT NULL`),
    uniqueIndex("projects_root_name").on(t.name).where(sql`${t.parentId} IS NULL`),
  ],
);
```

Trong `assets`: đổi `name: text("name").notNull().unique(),` thành

```ts
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
```

và trong mảng ràng buộc của `assets` thêm đầu tiên `unique("assets_series_name").on(t.seriesId, t.name),`.

Trong `videos`: thêm sau `id: id(),`

```ts
  seriesId: uuid("series_id")
    .notNull()
    .references(() => series.id, { onDelete: "restrict" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "restrict" }),
```

- [ ] **Step 3: Sinh migration và thêm phần xóa dữ liệu thử**

Run: `npx drizzle-kit generate --name series_projects`. Nếu drizzle-kit hỏi có phải đổi tên cột/bảng thì chọn tạo mới ("create"). Mở file `drizzle/00NN_series_projects.sql` vừa sinh và kiểm tra:
1. Có `CREATE TABLE "series"`, `CREATE TABLE "projects"`, `ADD COLUMN "series_id" uuid NOT NULL` ở `assets` và `videos`, `ADD COLUMN "project_id" ... NOT NULL`.
2. Có `DROP CONSTRAINT "assets_name_unique"` và `ADD CONSTRAINT "assets_series_name" UNIQUE("series_id","name")`.
3. Hai chỉ mục `projects_sibling_name` và `projects_root_name` **có mệnh đề `WHERE`**. Nếu thiếu (rủi ro ở bảng nguồn), sửa tay thành:

```sql
CREATE UNIQUE INDEX "projects_sibling_name" ON "projects" USING btree ("parent_id","name") WHERE "projects"."parent_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "projects_root_name" ON "projects" USING btree ("name") WHERE "projects"."parent_id" IS NULL;
```

Rồi **chèn vào đầu file** (trước mọi câu lệnh khác) phần xóa dữ liệu thử:

```sql
-- Xóa dữ liệu thử (spec series-project-design §7, quyết định 5): các cột NOT NULL mới không có giá trị mặc định.
DO $$ BEGIN
  IF to_regclass('pgmq.q_jobs') IS NOT NULL THEN PERFORM pgmq.purge_queue('jobs'); END IF;
  IF to_regclass('langgraph.checkpoints') IS NOT NULL THEN
    TRUNCATE langgraph.checkpoint_writes, langgraph.checkpoint_blobs, langgraph.checkpoints;
  END IF;
END $$;
--> statement-breakpoint
DELETE FROM "uploads";
--> statement-breakpoint
DELETE FROM "renders";
--> statement-breakpoint
DELETE FROM "scenes";
--> statement-breakpoint
DELETE FROM "scripts";
--> statement-breakpoint
DELETE FROM "validations";
--> statement-breakpoint
DELETE FROM "reviews";
--> statement-breakpoint
DELETE FROM "videos";
--> statement-breakpoint
DELETE FROM "asset_variants";
--> statement-breakpoint
DELETE FROM "assets";
--> statement-breakpoint
DELETE FROM "job_runs";
--> statement-breakpoint
```

- [ ] **Step 4: Sửa `src/lib/scene/catalog.ts`**

Đổi chữ ký và điều kiện:

```ts
export async function loadApprovedCatalog(seriesId: string): Promise<Catalog> {
```

và trong `.where(and(` thêm điều kiện đầu tiên `eq(assets.seriesId, seriesId),`.

- [ ] **Step 5: Sửa các job worker**

`src/worker/asset-jobs.ts`:
- `uniqueName(seriesId, base)`: đổi chữ ký `async function uniqueName(seriesId: string, base: string)` và điều kiện truy vấn thành `.where(and(eq(assets.seriesId, seriesId), eq(assets.name, candidate)))`.
- Trong `generateBase`: thêm `const seriesId = str(payload, "seriesId");` sau dòng `const brief = ...`; gọi `name = await uniqueName(seriesId, name);`; trong `.values({ ... })` thêm `seriesId,`.

`src/worker/script-jobs.ts`: ngay sau khi có `video` (sau `if (!video) throw ...`) thay `const catalog = await loadApprovedCatalog();` bằng `const catalog = await loadApprovedCatalog(video.seriesId);`.

`src/worker/scene-jobs.ts`: sau khi có `row` (kịch bản) thêm trước dòng `const catalog`:

```ts
  const [video] = await db.select().from(videos).where(eq(videos.id, row.videoId)).limit(1);
  if (!video) throw new PermanentJobError("Không có video của kịch bản này");
```

(thêm `videos` vào import schema) và đổi thành `await loadApprovedCatalog(video.seriesId)`.

`src/worker/render-jobs.ts`: trong `renderVideo`, sau khi có `render` thêm

```ts
    const [video] = await db.select().from(videos).where(eq(videos.id, render.videoId)).limit(1);
    if (!video) throw new PermanentJobError("Không có video của bản render này");
```

(thêm `videos` vào import schema) và đổi `loadApprovedCatalog()` thành `loadApprovedCatalog(video.seriesId)`.

- [ ] **Step 6: Sửa tạm `src/app/videos/actions.ts` để biên dịch được**

Trong `createVideo`, lấy `seriesId`, `projectId` từ form và dùng cho danh mục và insert (sẽ thay hẳn ở Task 4):

```ts
  const seriesId = text(form, "seriesId");
  const projectId = text(form, "projectId");
  if (!seriesId || !projectId) return { error: "Thiếu bộ phim hoặc project" };
  const catalog = await loadApprovedCatalog(seriesId);
```

và `.values({ title, brief, comboId: combo.id, seriesId, projectId })`.

Sửa `src/app/scenes/actions.ts` và `src/app/scenes/[videoId]/page.tsx`, `src/app/videos/page.tsx` cho biên dịch: nơi gọi `loadApprovedCatalog()` không có `seriesId` tạm thời truyền chuỗi rỗng bị cấm; thay vào đó `scenes/[videoId]/page.tsx` dùng `video.seriesId` (`const catalog = await loadApprovedCatalog(video.seriesId);`), `videos/page.tsx` sẽ bị xóa ở Task 4 nên tạm bọc: thay lời gọi bằng `loadApprovedCatalog("00000000-0000-0000-0000-000000000000")` kèm comment `// tạm, trang này bị thay ở Task 4`; `scenes/actions.ts` (playground) tạm đọc `formData.get("seriesId")` và trả lỗi "Chọn bộ phim" nếu rỗng (hoàn thiện ở Task 5).

- [ ] **Step 7: Cập nhật `docs/standards/asset-naming.md`**

Đổi luật 3 thành: "**Duy nhất trong từng bộ phim** (cặp `series_id` + tên); hai bộ phim có thể cùng có `chr_minh`." Và thêm một dòng ở đầu: "Asset thuộc về đúng một bộ phim; tham chiếu `@...` trong kịch bản/cảnh luôn hiểu theo bộ phim của design."

- [ ] **Step 8: Kiểm tra tĩnh**

Run: `npx tsc --noEmit` và `npm run lint` → không lỗi. (Nếu còn lỗi `FormState`/`loadApprovedCatalog`, sửa tiếp theo bước 1/5/6.)

- [ ] **Step 9: Áp migration (phá hủy dữ liệu thử) và dọn file**

Xác nhận `docker compose ps` không còn container cartoon chạy. Rồi:

Run: `npm run db:migrate`
Expected: áp `00NN_series_projects` không lỗi. Kiểm tra bằng script tạm (xóa sau khi dùng): `select count(*) from assets` = 0, `select count(*) from information_schema.tables where table_name in ('series','projects')` = 2.

Xóa file đã sinh: `rm -rf data/assets data/renders data/tmp` (Git Bash).

- [ ] **Step 10: Commit**

```bash
git add src/lib/form.ts src/lib/db/schema.ts drizzle docs/standards/asset-naming.md
git commit -m "feat(db): add series and projects and scope assets to series

BREAKING CHANGE: migration deletes all test data (assets, videos, scenes, renders, queue).

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git add src/lib/scene/catalog.ts src/worker src/app/videos src/app/scenes src/app/render src/app/upload src/app/assets/actions.ts src/components/videos src/components/scene src/components/render src/components/upload
git commit -m "refactor(worker): scope catalog and asset names to a series

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Tầng bộ phim và chuyển bước 1 (asset) vào bộ phim

**Files:**
- Create: `src/lib/series/queries.ts`, `src/app/series/actions.ts`, `src/app/series/page.tsx`
- Move (git mv): `src/app/assets/actions.ts` → `src/app/series/asset-actions.ts`; `src/app/assets/page.tsx` → `src/app/series/[seriesId]/page.tsx`; `src/app/assets/[id]/page.tsx` → `src/app/series/[seriesId]/assets/[assetId]/page.tsx`
- Modify: `src/lib/assets/queries.ts`, `src/components/assets/{create-asset-form,request-variant-form,variant-review}.tsx`

**Interfaces:**
- Consumes: Task 1.
- Produces: `listSeries(): Promise<(Series & { assetCount: number })[]>`, `getSeries(id)`, `createSeries`, `renameSeries`, `deleteSeries` (server actions `(prev: FormState, form: FormData)`); `readySeriesIds(): Promise<Set<string>>` (bộ phim có ≥ 1 `chr` và ≥ 1 `bg` đã duyệt); `listAssets(seriesId)`, `listPendingAssetJobs(seriesId)`; `createAsset` đọc `seriesId` từ form.

- [ ] **Step 1: Chuyển file bằng git mv**

```bash
mkdir -p "src/app/series/[seriesId]/assets/[assetId]"
git mv src/app/assets/actions.ts src/app/series/asset-actions.ts
git mv src/app/assets/page.tsx "src/app/series/[seriesId]/page.tsx"
git mv "src/app/assets/[id]/page.tsx" "src/app/series/[seriesId]/assets/[assetId]/page.tsx"
```

- [ ] **Step 2: Sửa `src/app/series/asset-actions.ts`**

- `createAsset`: thêm `const seriesId = field(form, "seriesId");` và kiểm tra `if (!seriesId) return { error: "Thiếu bộ phim" };`; đổi lời gọi job thành `enqueueJob("asset.generate_base", { assetId, seriesId, kind, brief, displayName }, { type: "asset", id: assetId });`; đổi `revalidatePath("/assets"); redirect("/assets");` thành `revalidatePath(\`/series/${seriesId}\`); redirect(\`/series/${seriesId}\`);`.
- `approveVariant`: kiểm tra trùng tên trong cùng bộ phim: điều kiện `.where(and(eq(assets.seriesId, asset.seriesId), eq(assets.name, name), ne(assets.id, asset.id)))`; các `revalidatePath` đổi thành `revalidatePath(\`/series/${asset.seriesId}/assets/${asset.id}\`); revalidatePath(\`/series/${asset.seriesId}\`);`.
- `rejectVariant`, `requestVariant`, `retryVariant`: mỗi hàm sau khi có `asset` (hoặc `variant`) lấy `seriesId` bằng `const [owner] = await db.select({ seriesId: assets.seriesId }).from(assets).where(eq(assets.id, <assetId>)).limit(1);` và đổi `revalidatePath(\`/assets/${assetId}\`)` thành `revalidatePath(\`/series/${owner.seriesId}/assets/${assetId}\`)`.
- Đầu file: `import type { FormState } from "@/lib/form";` và giữ `export type { FormState } from "@/lib/form";` (component import cả hai từ file này).

- [ ] **Step 3: Sửa `src/lib/assets/queries.ts`**

```ts
export async function listAssets(seriesId: string) {
  const db = getDb();
  const rows = await db.select().from(assets).where(eq(assets.seriesId, seriesId)).orderBy(desc(assets.createdAt));
  // phần còn lại giữ nguyên
```

`listPendingAssetJobs(seriesId)`: lọc thêm theo payload không có sẵn trong `job_runs`; vì payload nằm trong hàng đợi chứ không trong `job_runs`, dùng `target_id` trỏ tới `assetId` chưa tồn tại thì không lọc được theo bộ phim. Giữ hàm như cũ (đếm job đang chạy toàn hệ thống) và đổi nhãn trên trang thành "N asset đang được tạo (trong toàn hệ thống)".

- [ ] **Step 4: Sửa component asset**

Trong `create-asset-form.tsx`: đổi import `@/app/assets/actions` thành `@/app/series/asset-actions`, thêm prop `seriesId: string` (`export function CreateAssetForm({ seriesId }: { seriesId: string })`) và trong `<form>` thêm `<input type="hidden" name="seriesId" value={seriesId} />`. Trong `request-variant-form.tsx` và `variant-review.tsx` chỉ đổi đường dẫn import thành `@/app/series/asset-actions`.

- [ ] **Step 5: Tạo `src/lib/series/queries.ts`**

```ts
import { and, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { assets, assetVariants, series } from "@/lib/db/schema";

export type Series = typeof series.$inferSelect;

export async function listSeries(): Promise<(Series & { assetCount: number })[]> {
  const rows = await getDb()
    .select({ series, assetCount: sql<number>`count(${assets.id})::int` })
    .from(series)
    .leftJoin(assets, eq(assets.seriesId, series.id))
    .groupBy(series.id)
    .orderBy(desc(series.createdAt));
  return rows.map((r) => ({ ...r.series, assetCount: r.assetCount }));
}

export async function getSeries(id: string): Promise<Series | null> {
  const [row] = await getDb().select().from(series).where(eq(series.id, id)).limit(1);
  return row ?? null;
}

// Bộ phim dùng được cho design: có ít nhất 1 nhân vật và 1 bối cảnh đã duyệt ảnh gốc.
export async function readySeriesIds(): Promise<Set<string>> {
  const rows = await getDb()
    .select({ seriesId: assets.seriesId, kind: assets.kind })
    .from(assets)
    .innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
    .where(and(eq(assets.status, "approved"), eq(assetVariants.state, "base"), eq(assetVariants.status, "approved")));
  const kinds = new Map<string, Set<string>>();
  for (const r of rows) kinds.set(r.seriesId, (kinds.get(r.seriesId) ?? new Set()).add(r.kind));
  return new Set([...kinds].filter(([, k]) => k.has("chr") && k.has("bg")).map(([id]) => id));
}
```

- [ ] **Step 6: Tạo `src/app/series/actions.ts`**

```ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import { assets, series, videos } from "@/lib/db/schema";
import type { FormState } from "@/lib/form";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export async function createSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (name.length < 2) return { error: "Tên phim ít nhất 2 ký tự" };
  const [clash] = await getDb().select({ id: series.id }).from(series).where(eq(series.name, name)).limit(1);
  if (clash) return { error: "Đã có bộ phim tên này" };
  const [created] = await getDb().insert(series).values({ name }).returning({ id: series.id });
  revalidatePath("/series");
  redirect(`/series/${created.id}`);
}

export async function renameSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "seriesId");
  const name = text(form, "name");
  if (name.length < 2) return { error: "Tên phim ít nhất 2 ký tự" };
  const [clash] = await getDb().select({ id: series.id }).from(series).where(eq(series.name, name)).limit(1);
  if (clash && clash.id !== id) return { error: "Đã có bộ phim tên này" };
  await getDb().update(series).set({ name }).where(eq(series.id, id));
  revalidatePath(`/series/${id}`);
  revalidatePath("/series");
  return {};
}

// Chặn xóa khi còn asset hoặc design (RESTRICT ở DB; báo lỗi rõ ở đây).
export async function deleteSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "seriesId");
  const db = getDb();
  const [a] = await db.select({ id: assets.id }).from(assets).where(eq(assets.seriesId, id)).limit(1);
  if (a) return { error: "Bộ phim còn asset, không xóa được" };
  const [v] = await db.select({ id: videos.id }).from(videos).where(eq(videos.seriesId, id)).limit(1);
  if (v) return { error: "Bộ phim còn bản thiết kế, không xóa được" };
  await db.delete(series).where(eq(series.id, id));
  revalidatePath("/series");
  redirect("/series");
}
```

- [ ] **Step 7: Trang `/series` (`src/app/series/page.tsx`) và form tạo**

`page.tsx` (`force-dynamic`): tiêu đề "Bộ phim"; form tạo (client component nhỏ `CreateSeriesForm` đặt trong `src/components/series/create-series-form.tsx`, một ô `name` + nút, dùng `useActionState(createSeries, {})` giống `create-asset-form.tsx`); danh sách `listSeries()` mỗi dòng link `/series/{id}` hiện tên và số asset.

- [ ] **Step 8: Sửa `src/app/series/[seriesId]/page.tsx` (bước 1)**

Đổi props thành `{ params }: { params: Promise<{ seriesId: string }> }`; `const { seriesId } = await params;` kiểm UUID (`UUID_RE`) và `getSeries(seriesId)` (404 nếu không có); dùng `listAssets(seriesId)` và `listPendingAssetJobs()`; link tới asset `href={\`/series/${seriesId}/assets/${asset.id}\`}`; tiêu đề `h1` là tên bộ phim kèm link "← Bộ phim" về `/series`; `<CreateAssetForm seriesId={seriesId} />`. Thêm khối nhỏ đổi tên/xóa bộ phim (client component `SeriesSettings` dùng `renameSeries` và `deleteSeries`, mẫu như các form khác).

- [ ] **Step 9: Sửa `src/app/series/[seriesId]/assets/[assetId]/page.tsx`**

Đổi params thành `{ seriesId, assetId }`; `getAsset(assetId)`; nếu `asset.seriesId !== seriesId` thì `notFound()`; link quay lại `/series/${seriesId}` (chữ "← " + tên bộ phim hoặc "Assets"). Các link/ảnh còn lại giữ nguyên.

- [ ] **Step 10: Kiểm tra tĩnh, build, commit**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build` → không lỗi.

```bash
git add -A src/app/assets src/app/series src/lib/series src/lib/assets/queries.ts src/components/assets src/components/series
git commit -m "feat(series): add series layer and move asset step under a series

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Lưu ý: ở bước này dùng `git add` theo từng đường dẫn nêu trên, không dùng `git add -A` trên toàn repo; `-A` chỉ áp dụng trong phạm vi các thư mục liệt kê để ghi nhận cả việc xóa thư mục `src/app/assets`.)

---

### Task 3: Cây project (composite) và trang Project

**Files:**
- Create: `src/lib/project/tree.ts`, `src/lib/project/queries.ts`, `src/app/projects/actions.ts`, `src/app/projects/page.tsx`, `src/app/projects/[id]/page.tsx`, `src/components/projects/project-forms.tsx`

**Interfaces:**
- Produces: `interface TreeNode`, `class ProjectNode`, `class DesignNode`, `buildTree(projects, designs): ProjectNode[]`, `findProject(roots, id): ProjectNode | null`, `type NodeSummary`; `ancestors(projectId): Promise<{ id: string; name: string }[]>` (gốc → chính nó); `isInSubtree(rootId, candidateId): Promise<boolean>`; server action `createProject`, `renameProject`, `moveProject`, `deleteProject`.

- [ ] **Step 1: Tạo `src/lib/project/tree.ts`**

```ts
// Composite: node nhánh (project) chứa node nhánh/lá; node lá (design). Dựng trong bộ nhớ từ hai bảng.
export type NodeSummary = { designs: number; byStatus: Record<string, number> };

export interface TreeNode {
  readonly id: string;
  readonly name: string;
  readonly kind: "project" | "design";
  readonly children: readonly TreeNode[];
  summary(): NodeSummary;
}

export class DesignNode implements TreeNode {
  readonly kind = "design" as const;
  readonly children: readonly TreeNode[] = [];
  constructor(
    readonly id: string,
    readonly name: string,
    readonly status: string,
    readonly seriesId: string,
  ) {}
  summary(): NodeSummary {
    return { designs: 1, byStatus: { [this.status]: 1 } };
  }
}

export class ProjectNode implements TreeNode {
  readonly kind = "project" as const;
  readonly projects: ProjectNode[] = [];
  readonly designs: DesignNode[] = [];
  constructor(
    readonly id: string,
    readonly name: string,
    readonly parentId: string | null,
  ) {}
  get children(): readonly TreeNode[] {
    return [...this.projects, ...this.designs];
  }
  // Gộp số lượng của cả nhánh (con trực tiếp và mọi hậu duệ).
  summary(): NodeSummary {
    const total: NodeSummary = { designs: 0, byStatus: {} };
    for (const child of this.children) {
      const s = child.summary();
      total.designs += s.designs;
      for (const [status, n] of Object.entries(s.byStatus)) total.byStatus[status] = (total.byStatus[status] ?? 0) + n;
    }
    return total;
  }
}

type ProjectRow = { id: string; name: string; parentId: string | null };
type DesignRow = { id: string; title: string; status: string; projectId: string; seriesId: string };

// Trả về các project gốc, đã gắn con và design. Project mồ côi (cha không có) bị bỏ qua.
export function buildTree(projects: ProjectRow[], designs: DesignRow[]): ProjectNode[] {
  const nodes = new Map(projects.map((p) => [p.id, new ProjectNode(p.id, p.name, p.parentId)]));
  const roots: ProjectNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.projects.push(node);
    else if (!node.parentId) roots.push(node);
  }
  for (const d of designs) nodes.get(d.projectId)?.designs.push(new DesignNode(d.id, d.title, d.status, d.seriesId));
  const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name);
  for (const node of nodes.values()) {
    node.projects.sort(byName);
    node.designs.sort(byName);
  }
  return roots.sort(byName);
}

export function findProject(roots: ProjectNode[], id: string): ProjectNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const inChild = findProject(root.projects, id);
    if (inChild) return inChild;
  }
  return null;
}
```

- [ ] **Step 2: Tạo `src/lib/project/queries.ts`**

```ts
import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { projects, videos } from "@/lib/db/schema";

import { buildTree, type ProjectNode } from "./tree";

export async function loadTree(): Promise<ProjectNode[]> {
  const db = getDb();
  const [ps, ds] = await Promise.all([db.select().from(projects), db.select().from(videos)]);
  return buildTree(
    ps,
    ds.map((d) => ({ id: d.id, title: d.title, status: d.status, projectId: d.projectId, seriesId: d.seriesId })),
  );
}

// Đường dẫn từ project gốc tới project này (breadcrumb), theo thứ tự gốc -> chính nó.
export async function ancestors(projectId: string): Promise<{ id: string; name: string }[]> {
  const res = await getDb().execute<{ id: string; name: string }>(sql`
    WITH RECURSIVE up AS (
      SELECT id, name, parent_id, 0 AS depth FROM projects WHERE id = ${projectId}::uuid
      UNION ALL
      SELECT p.id, p.name, p.parent_id, u.depth + 1 FROM projects p JOIN up u ON p.id = u.parent_id
    )
    SELECT id, name FROM up ORDER BY depth DESC`);
  return res.rows;
}

// candidateId có nằm trong cây con gốc rootId (kể cả chính nó) không. Dùng để chống vòng lặp khi di chuyển.
export async function isInSubtree(rootId: string, candidateId: string): Promise<boolean> {
  const res = await getDb().execute<{ found: number }>(sql`
    WITH RECURSIVE sub AS (
      SELECT id FROM projects WHERE id = ${rootId}::uuid
      UNION ALL
      SELECT p.id FROM projects p JOIN sub s ON p.parent_id = s.id
    )
    SELECT 1 AS found FROM sub WHERE id = ${candidateId}::uuid LIMIT 1`);
  return res.rows.length > 0;
}
```

- [ ] **Step 3: Tạo `src/app/projects/actions.ts`**

```ts
"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import { projects, videos } from "@/lib/db/schema";
import type { FormState } from "@/lib/form";
import { isInSubtree } from "@/lib/project/queries";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

// Anh em cùng cha trùng tên (kể cả cùng ở gốc).
async function siblingClash(parentId: string | null, name: string, exceptId?: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(parentId ? eq(projects.parentId, parentId) : isNull(projects.parentId), eq(projects.name, name)));
  return rows.some((r) => r.id !== exceptId);
}

export async function createProject(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  const parentId = text(form, "parentId") || null;
  if (name.length < 1) return { error: "Nhập tên project" };
  if (await siblingClash(parentId, name)) return { error: "Đã có project cùng tên ở thư mục này" };
  const [created] = await getDb().insert(projects).values({ name, parentId }).returning({ id: projects.id });
  revalidatePath("/projects");
  redirect(`/projects/${created.id}`);
}

export async function renameProject(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "projectId");
  const name = text(form, "name");
  if (name.length < 1) return { error: "Nhập tên project" };
  const [p] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!p) return { error: "Không có project này" };
  if (await siblingClash(p.parentId, name, id)) return { error: "Đã có project cùng tên ở thư mục này" };
  await getDb().update(projects).set({ name }).where(eq(projects.id, id));
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return {};
}

// Di chuyển project vào cha mới (rỗng = đưa ra gốc). Từ chối nếu cha mới là chính nó hoặc hậu duệ của nó.
export async function moveProject(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "projectId");
  const newParent = text(form, "newParentId") || null;
  const [p] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!p) return { error: "Không có project này" };
  if (newParent && (await isInSubtree(id, newParent))) return { error: "Không thể chuyển project vào chính nó hoặc thư mục con của nó" };
  if (await siblingClash(newParent, p.name, id)) return { error: "Thư mục đích đã có project cùng tên" };
  await getDb().update(projects).set({ parentId: newParent }).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return {};
}

// Chặn xóa khi còn project con hoặc design (spec §3.3 mục 4).
export async function deleteProject(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "projectId");
  const db = getDb();
  const [child] = await db.select({ id: projects.id }).from(projects).where(eq(projects.parentId, id)).limit(1);
  if (child) return { error: "Thư mục còn project con, không xóa được" };
  const [design] = await db.select({ id: videos.id }).from(videos).where(eq(videos.projectId, id)).limit(1);
  if (design) return { error: "Thư mục còn bản thiết kế, không xóa được" };
  const [p] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/projects");
  redirect(p?.parentId ? `/projects/${p.parentId}` : "/projects");
}
```

- [ ] **Step 4: Form client `src/components/projects/project-forms.tsx`**

Xuất ba component, mỗi cái dùng `useActionState<FormState, FormData>` và hiện `state.error` màu `text-destructive` như các form trước:
- `CreateProjectForm({ parentId }: { parentId: string | null })`: ô `name`, input hidden `parentId` (`value={parentId ?? ""}`), nút "Tạo project" → `createProject`.
- `ProjectSettings({ project, others }: { project: { id: string; name: string; parentId: string | null }; others: { id: string; label: string }[] })`: form đổi tên (`renameProject`, hidden `projectId`), form di chuyển (`moveProject`, `select name="newParentId"` với option rỗng "(Gốc)" và `others`), nút xóa (`deleteProject`, hidden `projectId`).

`others` do trang `[id]` tính: mọi project trừ chính nó và hậu duệ của nó, nhãn là đường dẫn đầy đủ.

- [ ] **Step 5: Trang `/projects` và `/projects/[id]`**

`src/app/projects/page.tsx` (`force-dynamic`): `const roots = await loadTree();` hiện `CreateProjectForm parentId={null}` và danh sách cây dạng thụt lề (component đệ quy nhỏ `TreeList({ nodes })` trong cùng file, mỗi project là link `/projects/{id}` kèm `summary().designs` "N design", mỗi design là link `/designs/{id}` kèm trạng thái).

`src/app/projects/[id]/page.tsx` (`force-dynamic`): kiểm UUID; `const roots = await loadTree(); const node = findProject(roots, id);` (404 nếu null); `const trail = await ancestors(id)` làm breadcrumb (link từng cấp; gốc là link `/projects`); hiện `CreateProjectForm parentId={id}`; danh sách `node.projects` (link) và `node.designs` (link `/designs/{id}`); khối `ProjectSettings` với `others` tính bằng cách duyệt `roots` loại nhánh của `node`. Nút "Tạo bản thiết kế" là link tới `/projects/{id}/new-design` sẽ làm ở Task 4 (đặt chỗ ngay: `<Link href={\`/projects/${id}/new-design\`}>`).

- [ ] **Step 6: Kiểm tra tĩnh, build, chạy thật phần cây (không tốn credit)**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Chạy thật: `npx next dev --turbopack -H 127.0.0.1 -p 3920`, bằng trình duyệt tích hợp:
1. `/projects`: tạo "A"; vào "A" tạo "B"; vào "B" tạo "C" (3 cấp). Breadcrumb ở C hiện A › B › C.
2. Tạo lại "B" trong "A" → báo trùng tên; tạo "A" ở gốc → báo trùng.
3. Trên A thử di chuyển vào C → báo "không thể chuyển ... thư mục con của nó"; di chuyển C ra gốc → thành công; di chuyển lại C vào B → thành công.
4. Xóa B khi còn C → báo còn project con; xóa C rồi B → thành công.
Dừng dev.

- [ ] **Step 7: Commit**

```bash
git add src/lib/project src/app/projects src/components/projects
git commit -m "feat(projects): add nested project folders with composite tree

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bản thiết kế (design): tạo, trang design và chuyển các bước 2–7

**Files:**
- Move (git mv): `src/app/videos/actions.ts` → `src/app/designs/actions.ts`; `src/app/videos/[id]/page.tsx` → `src/app/designs/[id]/page.tsx`; `src/app/scenes/[videoId]/page.tsx` → `src/app/designs/[id]/storyboard/page.tsx`; `src/app/render/[videoId]/page.tsx` → `src/app/designs/[id]/render/page.tsx`; `src/app/upload/[videoId]/page.tsx` → `src/app/designs/[id]/upload/page.tsx`
- Delete: `src/app/videos/page.tsx`, `src/app/scenes/page.tsx`, `src/app/render/page.tsx`, `src/app/upload/page.tsx`
- Create: `src/app/designs/[id]/layout.tsx`, `src/app/projects/[id]/new-design/page.tsx`
- Modify: `src/components/videos/create-video-form.tsx`, `src/app/scenes/storyboard-actions.ts`, `src/app/render/actions.ts`, `src/app/upload/actions.ts`, các `import` trỏ tới file đã chuyển

**Interfaces:**
- Consumes: Task 1–3.
- Produces: `createDesign` (form: `projectId`, `seriesId`, `title`, `brief`, `targetSeconds`, `assetNames`); layout `/designs/[id]` với tab; `changeDesignSeries` (chỉ khi chưa có kịch bản).

- [ ] **Step 1: Chuyển file**

```bash
mkdir -p "src/app/designs/[id]/storyboard" "src/app/designs/[id]/render" "src/app/designs/[id]/upload"
git mv src/app/videos/actions.ts src/app/designs/actions.ts
git mv "src/app/videos/[id]/page.tsx" "src/app/designs/[id]/page.tsx"
git mv "src/app/scenes/[videoId]/page.tsx" "src/app/designs/[id]/storyboard/page.tsx"
git mv "src/app/render/[videoId]/page.tsx" "src/app/designs/[id]/render/page.tsx"
git mv "src/app/upload/[videoId]/page.tsx" "src/app/designs/[id]/upload/page.tsx"
git rm -q src/app/videos/page.tsx src/app/scenes/page.tsx src/app/render/page.tsx src/app/upload/page.tsx
```

Sửa import trỏ tới `@/app/videos/actions` thành `@/app/designs/actions` (trong `src/components/videos/*.tsx`).

- [ ] **Step 2: Sửa `src/app/designs/actions.ts`**

Thay `createVideo` bằng `createDesign` (không còn bản tạm của Task 1), thêm `changeDesignSeries`:

```ts
const TARGET_RANGE = "Thời lượng 30–600 giây";

// Kiểm tra bộ asset chọn: ít nhất 1 nhân vật và 1 bối cảnh đã duyệt của bộ phim.
async function pickAssets(seriesId: string, names: string[]): Promise<{ chosen: string[] } | { error: string }> {
  const catalog = await loadApprovedCatalog(seriesId);
  const chosen = names.filter((n) => catalog.has(n));
  if (!chosen.some((n) => catalog.get(n)?.kind === "chr")) return { error: "Chọn ít nhất 1 nhân vật đã duyệt" };
  if (!chosen.some((n) => catalog.get(n)?.kind === "bg")) return { error: "Chọn ít nhất 1 bối cảnh đã duyệt" };
  return { chosen };
}

// Tạo design. Có `assetNames` thì viết kịch bản ngay; không có thì chỉ tạo design (chọn asset sau ở trang design).
export async function createDesign(_prev: FormState, form: FormData): Promise<FormState> {
  const projectId = text(form, "projectId");
  const seriesId = text(form, "seriesId");
  const title = text(form, "title");
  const brief = text(form, "brief");
  const targetSeconds = Number(text(form, "targetSeconds"));
  const assetNames = form.getAll("assetNames").filter((v): v is string => typeof v === "string");
  if (title.length < 3) return { error: "Tiêu đề ít nhất 3 ký tự" };
  if (!projectId) return { error: "Thiếu project" };
  if (!seriesId) return { error: "Chọn bộ phim" };
  if (!Number.isInteger(targetSeconds) || targetSeconds < 30 || targetSeconds > 600) return { error: TARGET_RANGE };
  const picked = assetNames.length ? await pickAssets(seriesId, assetNames) : null;
  if (picked && "error" in picked) return { error: picked.error };

  const combo = await ensureDefaultCombo();
  const [video] = await getDb()
    .insert(videos)
    .values({ title, brief, comboId: combo.id, seriesId, projectId })
    .returning({ id: videos.id });
  if (picked) await startScriptVersion(video.id, { assetNames: picked.chosen, targetSeconds });
  revalidatePath(`/projects/${projectId}`);
  redirect(`/designs/${video.id}`);
}

// Design chưa có kịch bản: chọn asset và thời lượng rồi viết kịch bản v1.
export async function createScript(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const targetSeconds = Number(text(form, "targetSeconds"));
  const assetNames = form.getAll("assetNames").filter((v): v is string => typeof v === "string");
  if (!Number.isInteger(targetSeconds) || targetSeconds < 30 || targetSeconds > 600) return { error: TARGET_RANGE };
  const db = getDb();
  const [video] = await db.select().from(videos).where(eq(videos.id, videoId)).limit(1);
  if (!video) return { error: "Không có design này" };
  const [existing] = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.videoId, videoId)).limit(1);
  if (existing) return { error: "Design đã có kịch bản" };
  const picked = await pickAssets(video.seriesId, assetNames);
  if ("error" in picked) return { error: picked.error };
  await startScriptVersion(videoId, { assetNames: picked.chosen, targetSeconds });
  revalidatePath(`/designs/${videoId}`);
  return {};
}

// Chỉ đổi bộ phim khi design chưa có kịch bản nào (spec §3.3 mục 2).
export async function changeDesignSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const videoId = text(form, "videoId");
  const seriesId = text(form, "seriesId");
  const db = getDb();
  const [existing] = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.videoId, videoId)).limit(1);
  if (existing) return { error: "Design đã có kịch bản, không đổi được bộ phim" };
  await db.update(videos).set({ seriesId }).where(eq(videos.id, videoId));
  revalidatePath(`/designs/${videoId}`);
  return {};
}
```

Đổi các `revalidatePath(\`/videos/...\`)` còn lại (trong `approveScript`, `rejectScript`, `regenerateScript`) thành `revalidatePath(\`/designs/${found.row.videoId}\`)`. Thêm `scripts` vào import schema nếu chưa có.

- [ ] **Step 3: Form tạo design (`src/app/projects/[id]/new-design/page.tsx` + sửa `create-video-form.tsx`)**

`new-design/page.tsx` (`force-dynamic`): kiểm UUID project; tải `listSeries()` và `readySeriesIds()`; với mỗi bộ phim sẵn sàng tải `loadApprovedCatalog(seriesId)` và gom thành `{ id, name, assets: { name, displayName, kind }[] }[]`; nếu không có bộ phim sẵn sàng hiện hướng dẫn quay lại `/series`. Render `<CreateVideoForm projectId={id} series={seriesOptions} />`.

Sửa `src/components/videos/create-video-form.tsx`: props `{ projectId: string; series: { id: string; name: string; assets: AssetOption[] }[] }`; thêm `useState` chọn `seriesId` (mặc định bộ phim đầu tiên), `<select name="seriesId">` đổi `seriesId` state; hidden `projectId`; danh sách checkbox `assetNames` hiển thị theo `series.find(s => s.id === seriesId).assets` (dùng `key={seriesId}` để đặt lại tick); action là `createDesign`.

- [ ] **Step 4: Layout design `src/app/designs/[id]/layout.tsx`**

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";

import { DesignTabs } from "@/components/designs/design-tabs";
import { ancestors } from "@/lib/project/queries";
import { getVideo } from "@/lib/video/queries";
import { getSeries } from "@/lib/series/queries";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function DesignLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await getVideo(id);
  if (!data) notFound();
  const { video } = data;
  const [trail, series] = await Promise.all([ancestors(video.projectId), getSeries(video.seriesId)]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/projects" className="hover:underline">
            Project
          </Link>
          {trail.map((p) => (
            <span key={p.id}>
              {" › "}
              <Link href={`/projects/${p.id}`} className="hover:underline">
                {p.name}
              </Link>
            </span>
          ))}
        </p>
        <h1 className="text-2xl font-semibold">{video.title}</h1>
        <p className="text-sm text-muted-foreground">
          Bộ phim:{" "}
          {series ? (
            <Link href={`/series/${series.id}`} className="underline">
              {series.name}
            </Link>
          ) : (
            "?"
          )}
        </p>
      </div>
      <DesignTabs designId={id} />
      {children}
    </div>
  );
}
```

Tạo `src/components/designs/design-tabs.tsx` (client, dùng `usePathname`): bốn tab `Kịch bản` (`/designs/{id}`), `Phân cảnh và cảnh` (`/storyboard`), `Ghép video` (`/render`), `Upload` (`/upload`); tab đang mở có `font-medium` và gạch chân; kiểu giống `app-sidebar.tsx`. (Bước 3 "Phân cảnh" và bước 4 "Sinh cảnh" của pipeline cùng nằm ở một trang, như hiện tại; tab gộp thành "Phân cảnh và cảnh".)

- [ ] **Step 5: Sửa các trang đã chuyển**

- `designs/[id]/page.tsx` (kịch bản): bỏ `<Link href="/videos">` và `<h1>` (layout đã có); giữ nguyên nội dung các phiên bản kịch bản; link cuối trang "Tiếp theo" đổi thành `/designs/${video.id}/storyboard`. Khi `versions.length === 0` hiện hai khối client component (đặt trong `src/components/designs/`): `StartScriptForm` (ô `targetSeconds` mặc định 90 + checkbox asset của bộ phim, gọi `createScript`; trang truyền `assets` từ `loadApprovedCatalog(video.seriesId)`) và `ChangeSeriesForm` (select bộ phim sẵn sàng từ `readySeriesIds()`, gọi `changeDesignSeries`).
- `designs/[id]/storyboard/page.tsx`: đổi `params` thành `{ id }`, `const { id: videoId } = await params;` (giữ phần thân dùng `videoId`), bỏ `<Link href="/scenes">` và `<h1>`; `loadApprovedCatalog(video.seriesId)` (đã làm ở Task 1).
- `designs/[id]/render/page.tsx`: tương tự (`{ id: videoId }`), bỏ link/`h1` đầu trang.
- `designs/[id]/upload/page.tsx`: tương tự.
- `src/app/scenes/storyboard-actions.ts`, `src/app/render/actions.ts`, `src/app/upload/actions.ts`: đổi mọi `revalidatePath(\`/scenes/${x}\`)` thành `/designs/${x}/storyboard`, `/render/${x}` thành `/designs/${x}/render`, `/upload/${x}` thành `/designs/${x}/upload`.
- Các `src/lib/**/queries.ts` có `listRenderableVideos`, `listVideosWithScript` không còn dùng: xóa nếu không có tham chiếu (`grep` trước khi xóa); `agreementRate()` giữ cho Tổng quan (Task 5).

- [ ] **Step 6: Kiểm tra tĩnh và build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build` → không lỗi; bảng route có `/designs/[id]`, `/designs/[id]/storyboard`, `/designs/[id]/render`, `/designs/[id]/upload`, `/projects/[id]/new-design`, và không còn `/videos`, `/render`, `/upload`.

- [ ] **Step 7: Commit**

```bash
git status --short   # kiểm tra: chỉ có file thuộc task này (git mv/git rm đã tự stage việc chuyển/xóa)
git add src/app/designs src/app/projects src/app/scenes/storyboard-actions.ts src/app/render/actions.ts src/app/upload/actions.ts src/components/designs src/components/videos src/lib/video
git commit -m "feat(designs): add design pages under projects and move steps 2-7 into them

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```


---

### Task 5: Điều hướng, Tổng quan, sân thử, tài liệu và chạy thật

**Files:**
- Modify: `src/components/app-sidebar.tsx`, `src/app/page.tsx`, `src/lib/pipeline/steps.ts`, `src/app/scenes/actions.ts`, `src/app/scenes/playground/page.tsx`, `src/components/scene/playground-form.tsx`, `CLAUDE.md`, `README.md`

- [ ] **Step 1: Menu bên (`src/components/app-sidebar.tsx`)**

Bỏ khối "Quy trình" và `PIPELINE_STEPS`. `MAIN_LINKS` thành:

```ts
const MAIN_LINKS = [
  { href: "/", label: "Tổng quan" },
  { href: "/series", label: "Bộ phim" },
  { href: "/projects", label: "Project" },
  { href: "/jobs", label: "Jobs" },
];
```

Giữ nguyên `isActive`, `linkClass`; thêm một liên kết phụ "Sân thử JSON cảnh" (`/scenes/playground`) bên dưới nhóm chính với nhãn nhóm "Công cụ".

- [ ] **Step 2: `src/lib/pipeline/steps.ts` và Tổng quan (`src/app/page.tsx`)**

`steps.ts`: giữ mảng `PIPELINE_STEPS` làm mô tả quy trình nhưng đổi `href` thành `undefined` cho mọi bước (các bước nay nằm trong design) và đổi `description` của bước 1 thành "Quản lý ở trang Bộ phim". Trên Tổng quan: đổi tiêu đề mục "Quy trình 7 bước" thành chuỗi mô tả bước 1 (Bộ phim → asset) và 2–7 (trong mỗi design); thêm hai card: "Bộ phim" (số bộ phim, link `/series`) và "Project gần đây" (5 design mới nhất từ `videos`, link `/designs/{id}`), và card "Đồng thuận giám khảo – người duyệt" dùng `agreementRate()` (đã có ở `src/lib/scene/queries.ts`, cùng nội dung như trang `/scenes` cũ).

- [ ] **Step 3: Sân thử JSON cảnh chọn bộ phim**

`src/app/scenes/actions.ts` (`playground`): đọc `const seriesId = String(formData.get("seriesId") ?? "")`; nếu rỗng trả `{ json, issues: ["Chọn bộ phim"] }`; dùng `loadApprovedCatalog(seriesId)`. `src/app/scenes/playground/page.tsx`: tải `listSeries()` và truyền `<PlaygroundForm series={...} />`, đổi link quay lại thành `href="/"` chữ "← Tổng quan". `playground-form.tsx`: nhận `series: { id: string; name: string }[]`, thêm `<select name="seriesId">` phía trên textarea.

- [ ] **Step 4: Tài liệu**

`CLAUDE.md`: thêm vào mục Kiến trúc:

```markdown
- **Bộ phim, Project, Design (2026-10-21):** `series` sở hữu `assets` (tên asset duy nhất trong từng bộ phim); `projects` là thư mục lồng nhau (`parent_id`, adjacency list, duyệt bằng recursive CTE trong `src/lib/project/queries.ts`; composite `ProjectNode`/`DesignNode` ở `src/lib/project/tree.ts`); design = bảng `videos` (có `series_id`, `project_id`), tên bảng giữ nguyên ở DB. Mọi danh mục asset phải gọi `loadApprovedCatalog(seriesId)` với `seriesId` của design. Bước 1 ở `/series/[seriesId]`, bước 2–7 ở `/designs/[id]/...`. Xóa series/project bị chặn khi còn node con, asset hoặc design.
```

`README.md`: sửa mục luồng/dùng thử cho đúng route mới (`/series`, `/projects`, `/designs/...`).

- [ ] **Step 5: Kiểm tra tĩnh và build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

- [ ] **Step 6: Chạy thật (tốn 1 lời gọi LLM viết kịch bản; 2 ảnh nếu tạo asset thật)**

Điều kiện: không còn container cartoon chạy; DB đã sạch từ Task 1. Chạy `npm run worker` nền và dev server cổng 3920.
1. `/series`: tạo "Phim thử". Vào trang bộ phim: tạo một nhân vật và một bối cảnh (2 lần LLM + 2 ảnh ≈ 1–2 phút), duyệt cả hai (đặt tên `chr_minh`, `bg_lop_hoc`).
2. Tạo bộ phim thứ hai "Phim khác" và tạo lại một asset tên `chr_minh` ở đó: phải được phép (tên duy nhất theo bộ phim). Xóa bộ phim thứ hai khi còn asset → bị chặn.
3. `/projects`: tạo "A" › "B"; trong "B" bấm "Tạo bản thiết kế": danh sách bộ phim chỉ gồm bộ phim đã có ít nhất 1 nhân vật và 1 bối cảnh đã duyệt ("Phim thử"); chọn nó, tick asset, 60 giây, tạo.
4. Trang design: breadcrumb A › B, tên bộ phim, các tab; kịch bản v1 sinh ra (1–3 lời gọi LLM) và duyệt được. Mở các tab Phân cảnh và cảnh / Ghép video / Upload: tải được, không lỗi (không cần chạy tiếp).
5. Trên "A" thử di chuyển vào "B" → bị từ chối; xóa "B" khi còn design → bị chặn.
6. `/scenes/playground`: chọn "Phim thử", "Dùng mẫu" rồi xem trước.
Dừng dev và worker.

- [ ] **Step 7: Commit**

```bash
git add src/components/app-sidebar.tsx src/app/page.tsx src/lib/pipeline/steps.ts src/app/scenes src/components/scene
git commit -m "feat(ui): add series and project navigation and series-aware playground

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git add CLAUDE.md README.md
git commit -m "docs: describe series, project folders and designs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

## Self-review

- **Spec §3 (dữ liệu):** `series`, `projects` + hai unique index từng phần, cột mới ở `assets`/`videos`, bỏ unique toàn cục của tên asset → Task 1. Quy tắc §3.3: chống vòng lặp (Task 3 `moveProject`), khóa đổi bộ phim (Task 4 `changeDesignSeries`), asset theo bộ phim (Task 1 catalog + job), xóa bị chặn (Task 2–3).
- **§3.4/§4 (cây, composite):** `tree.ts` + CTE trong `queries.ts` → Task 3.
- **§5 (giao diện):** menu, `/series`, `/projects`, `/designs/[id]/...`, playground → Task 2–5. **Lệch có chủ ý:** spec liệt kê 5 mục tiến trình (Kịch bản · Phân cảnh · Sinh cảnh · Ghép video · Upload); trang hiện tại gộp phân cảnh và sinh cảnh, nên tab là 4 mục ("Phân cảnh và cảnh"). Cần user xác nhận khi duyệt plan.
- **§7 (di trú):** migration xóa dữ liệu + dọn file → Task 1 bước 3 và 9.
- **Rủi ro còn mở:** (1) Drizzle `uniqueIndex().where()` chưa thấy trong tài liệu đã tra, đã có bước kiểm SQL sinh ra; (2) `drizzle-kit generate` có thể hỏi tương tác; (3) Task 4 bước 2 thay đổi nhẹ so với spec (cho phép tạo design chưa có kịch bản để dùng `changeDesignSeries`); nếu user không muốn, bỏ `changeDesignSeries` và luôn tạo kịch bản ngay.
- Tên dùng xuyên suốt: `loadApprovedCatalog(seriesId)`, `readySeriesIds`, `listSeries`, `ProjectNode`/`DesignNode`/`buildTree`/`findProject`, `ancestors`, `isInSubtree`, `createDesign`, `changeDesignSeries`, `FormState` (`@/lib/form`).
