# Thiết kế: Bộ phim (series), Project dạng thư mục và Bản thiết kế (design)

- Ngày: 2026-10-21
- Trạng thái: **chờ user duyệt** (AGENTS.md luật 3: thay đổi schema phải qua spec)
- Cập nhật: `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md` (spec gốc của pipeline 7 bước). Spec này chỉ thêm tầng tổ chức phía trên; mọi hợp đồng JSON (kịch bản `ScriptV1`, cảnh v1, combo) giữ nguyên.

## 1. Mục tiêu

Hiện tại asset nằm chung một kho và video là đơn vị làm việc duy nhất. Cần:
1. Một tầng **bộ phim hoạt hình (series)** chỉ có tên, sở hữu các asset (nhân vật, bối cảnh, đạo cụ, hiệu ứng). Quản lý asset (bước 1) tách độc lập ở tầng này.
2. **Project** là thư mục (composite pattern) có thể lồng nhau không giới hạn độ sâu, chứa project con và các bản thiết kế.
3. **Bản thiết kế (design)** là một tập phim: bắt đầu bằng việc chọn bộ phim, sau đó chạy các bước 2–7 (kịch bản → phân cảnh → sinh cảnh → ghép video → upload). Một project có nhiều design.

## 2. Quyết định đã chốt (với user, 2026-10-21)

| # | Quyết định |
|---|---|
| 1 | Project lồng nhau **không giới hạn**; node nhánh = project, node lá = design. |
| 2 | **Design = một video/tập**: bảng `videos` hiện tại giữ vai design (thêm `series_id`, `project_id`). Tên bảng giữ nguyên ở DB, giao diện gọi là "bản thiết kế". |
| 3 | Tên asset **duy nhất trong từng bộ phim**, không còn duy nhất toàn cục. |
| 4 | Menu bên gồm 2 khu vực: **Bộ phim** (mở ra là trang asset = bước 1) và **Project** (cây thư mục); thanh tiến trình bước 2–7 nằm **trong trang design**. |
| 5 | **Xóa toàn bộ dữ liệu thử** hiện có và bắt đầu sạch (không di trú). |
| 6 | Một design thuộc **đúng một** bộ phim và chỉ dùng asset của bộ phim đó. |

## 3. Mô hình dữ liệu (thay đổi schema)

### 3.1 Bảng mới

**`series`** (bộ phim)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL, UNIQUE | Tên phim; chỉ có thông tin này theo yêu cầu |
| `created_at` | timestamptz | |

**`projects`** (thư mục)

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `name` | text NOT NULL | |
| `parent_id` | uuid NULL → `projects.id` | `NULL` = project gốc. Tự tham chiếu: `references((): AnyPgColumn => projects.id)`; `ON DELETE RESTRICT` |
| `created_at` | timestamptz | |

Ràng buộc: tên duy nhất giữa các anh em cùng cha. Postgres coi `NULL` là khác nhau trong `UNIQUE`, nên dùng **hai unique index từng phần**: `UNIQUE (parent_id, name) WHERE parent_id IS NOT NULL` và `UNIQUE (name) WHERE parent_id IS NULL`.

### 3.2 Bảng sửa

**`assets`**
- Thêm `series_id uuid NOT NULL → series.id ON DELETE RESTRICT`.
- Bỏ `UNIQUE (name)`; thêm `UNIQUE (series_id, name)`. Hai `CHECK` về định dạng tên và khớp `kind` giữ nguyên.

**`videos`** (vai trò design)
- Thêm `series_id uuid NOT NULL → series.id ON DELETE RESTRICT`.
- Thêm `project_id uuid NOT NULL → projects.id ON DELETE RESTRICT`.
- `channel_id` giữ nguyên (nullable, bắt buộc ở bước upload).

Các bảng `scripts`, `scenes`, `validations`, `reviews`, `renders`, `uploads`, `job_runs`, `combos`, `channels`, `asset_variants` **không đổi**.

### 3.3 Quy tắc toàn vẹn (kiểm tra ở tầng app, vì khó diễn đạt bằng ràng buộc DB)

1. **Không tạo vòng lặp:** khi di chuyển project P vào cha mới Q, từ chối nếu Q là P hoặc hậu duệ của P (kiểm tra bằng truy vấn đệ quy).
2. **Đổi bộ phim của design** chỉ được khi design chưa có kịch bản nào. Sau đó khóa, vì kịch bản và cảnh tham chiếu asset của bộ phim.
3. **Asset được dùng** trong mọi truy vấn của một design phải thuộc `videos.series_id` của design đó (danh mục, kiểm tra tham chiếu, render).
4. **Xóa** project, bộ phim bị chặn (`RESTRICT`) khi còn node con, asset hoặc design. Không có xóa dây chuyền ở lát này.

### 3.4 Truy vấn cây

Duyệt cây bằng recursive CTE của Postgres (SQL thuần qua `db.execute(sql...)`, vì tài liệu Drizzle đã tra chỉ nêu khai báo tự tham chiếu `AnyPgColumn`, không nêu CTE đệ quy). Hai phép cần dùng: danh sách hậu duệ của một project (chống vòng lặp, gộp thống kê nhánh) và đường dẫn tổ tiên (breadcrumb). Quy mô dự kiến vài trăm node, nên adjacency list là đủ.

**Các phương án đã cân nhắc:** materialized path (đọc nhánh nhanh nhưng di chuyển phải cập nhật hàng loạt) và closure table (truy vấn nhanh nhất nhưng thêm bảng, ghi phức tạp). Chọn adjacency list vì đơn giản và khớp quy mô.

## 4. Composite pattern trong code

Interface `TreeNode { id; name; kind: "project" | "design"; children(): TreeNode[]; summary(): NodeSummary }`:
- `ProjectNode` là node nhánh: `children` gồm `ProjectNode` con và `DesignNode`; `summary` gộp số design và số design theo trạng thái của cả nhánh.
- `DesignNode` là node lá: `children` rỗng; `summary` là chính trạng thái design.

Chỉ là lớp trình bày dựng từ hai bảng (`projects`, `videos`); không có bảng "node" riêng. Dựng cây trong bộ nhớ từ danh sách phẳng (một truy vấn cho `projects`, một cho `videos`).

## 5. Giao diện và điều hướng

Menu bên: **Tổng quan · Bộ phim · Project · Jobs**.

| Route | Nội dung |
|---|---|
| `/series` | Danh sách bộ phim, tạo mới (chỉ nhập tên) |
| `/series/[id]` | Trang một bộ phim = **bước 1 (assets)** như hiện tại nhưng khóa theo bộ phim: tạo asset, danh sách |
| `/series/[id]/assets/[assetId]` | Chi tiết, duyệt ảnh gốc, biến thể (thay `/assets/[id]`) |
| `/projects` | Cây thư mục gốc; tạo project, tạo design |
| `/projects/[id]` | Một thư mục: breadcrumb, project con, design, đổi tên, di chuyển, xóa (khi rỗng) |
| `/designs/[id]` | Một design: bước 0 chọn bộ phim (nếu chưa có kịch bản) và thanh tiến trình **Kịch bản · Phân cảnh · Sinh cảnh · Ghép video · Upload** |
| `/designs/[id]/script`, `/storyboard`, `/render`, `/upload` | Các trang hiện tại của bước 2, 3–4, 6, 7, chuyển vào dưới design |
| `/scenes/playground` | Giữ nguyên làm công cụ độc lập (link từ Tổng quan); dùng danh mục theo bộ phim chọn trên trang |

Tạo design: chọn project (thư mục chứa) → nhập tiêu đề, brief, thời lượng → **chọn bộ phim** (chỉ liệt kê bộ phim đã có ≥ 1 nhân vật và ≥ 1 bối cảnh đã duyệt) → vào bước kịch bản. Asset chọn dùng trong design lấy từ bộ phim đó.

Các route cũ (`/assets`, `/videos`, `/scenes/[videoId]`, `/render`, `/upload`) bị xóa, không để chuyển hướng (chưa có người dùng ngoài).

## 6. Ảnh hưởng tới code hiện có

| Khu vực | Thay đổi |
|---|---|
| `src/lib/db/schema.ts` + migration | Bảng `series`, `projects`; cột mới của `assets`, `videos`; ràng buộc §3 |
| `src/lib/scene/catalog.ts` | `loadApprovedCatalog(seriesId)` |
| Job `asset.generate_base`/`generate_variant` | Payload thêm `seriesId`; `uniqueName()` kiểm tra duy nhất **trong bộ phim** |
| Job `script.generate`, `scenes.generate`, `video.render` | Lấy `series_id` từ design, truyền vào `loadApprovedCatalog` |
| `src/app/assets/*`, `src/lib/assets/queries.ts` | Chuyển sang `/series/[id]` và nhận `seriesId` |
| `src/app/videos|scenes|render|upload/*` | Chuyển dưới `/designs/[id]/...`; các action nhận `videoId` như cũ |
| `src/lib/pipeline/steps.ts`, `src/components/app-sidebar.tsx`, `src/app/page.tsx` | Menu mới; trang Tổng quan hiện bộ phim, project gốc và design gần đây |
| `docs/standards/asset-naming.md` | Quy tắc 3 đổi thành "duy nhất trong bộ phim" |
| `CLAUDE.md`, `README.md` | Mô tả mô hình mới |

Không đổi: hàng đợi pgmq, worker runner, storage (`data/assets/<assetId>/...` vẫn đúng vì theo `assetId`), 9router, Remotion, YouTube, các khuôn JSON.

## 7. Di trú

Theo quyết định 5, **xóa dữ liệu thử** và bắt đầu sạch:
1. Migration thêm cột `NOT NULL` không giá trị mặc định, nên bước đầu migration `DELETE` các bảng nghiệp vụ theo thứ tự phụ thuộc (`uploads`, `renders`, `scenes`, `scripts`, `validations`, `reviews`, `videos`, `asset_variants`, `assets`, `job_runs`) rồi mới đổi cấu trúc. `combos`, `channels` giữ lại.
2. Hàng đợi `pgmq` được làm rỗng (`pgmq.purge_queue('jobs')`) để không còn message trỏ tới đối tượng đã xóa; bảng checkpoint trong schema `langgraph` cũng xóa sạch.
3. Xóa thư mục `data/assets`, `data/renders`, `data/tmp` (lệnh thủ công, ghi trong plan).
4. Sau migration, DB rỗng: người dùng tạo bộ phim đầu tiên, rồi asset, project, design. Mất các asset thử (2 asset, 1 video, 6 cảnh, 1 render) và credit đã tốn để sinh ảnh.

Vì migration có thao tác phá hủy dữ liệu, plan phải ghi rõ và chỉ chạy sau khi user duyệt plan. Trên DB đã rỗng, các câu `DELETE` vô hại.

## 8. Rủi ro và lưu ý

- Chạm khoảng 25 file; chia plan thành các bước độc lập (schema + migration; tầng bộ phim và asset; cây project; design và điều hướng), mỗi bước build được.
- Tên bảng `videos` lệch với từ "design" trên giao diện; chấp nhận để khỏi đổi hàng loạt khóa ngoại. Ghi rõ trong `CLAUDE.md`.
- Kiểm tra vòng lặp khi di chuyển có thể bị qua mặt nếu hai yêu cầu di chuyển chạy đồng thời; chấp nhận vì một người vận hành, ghi lại nếu mở rộng.
- Đổi tên asset duy nhất theo bộ phim làm kịch bản/cảnh cũ hiểu `@chr_minh` theo bộ phim của design; không còn mơ hồ vì design có đúng một bộ phim.
- Spec gốc §13 "Không có đăng nhập" và ngoại lệ publish không đổi.

## 9. Kiểm thử

Theo AGENTS.md luật 4–6: không có test tự động. Xác minh bằng `tsc`, lint, build và chạy thật: tạo bộ phim, tạo asset trong bộ phim, tạo project lồng 3 cấp, tạo design, chạy tới hết bước phân cảnh (có thể rút gọn), thử di chuyển project vào hậu duệ của chính nó (phải bị từ chối), thử xóa project còn node con (phải bị chặn).

## 10. Ngoài phạm vi

Nhiều bộ phim trong một design; sao chép/nhân bản design; chia sẻ asset giữa các bộ phim; kéo-thả sắp xếp trên giao diện; xóa dây chuyền; quyền theo project; tìm kiếm trong cây.

## 11. Nguồn đã dùng

- Drizzle ORM (context7 `/websites/orm_drizzle_team`, trang indexes-constraints, tra 2026-10-21): khai báo khóa ngoại tự tham chiếu bằng `references((): AnyPgColumn => table.id)` hoặc `foreignKey()`; `unique().on(...)`; chỉ mục unique; không nêu CTE đệ quy nên dùng SQL thuần.
- PostgreSQL: recursive CTE và unique index từng phần là tính năng chuẩn của Postgres; sẽ xác nhận bằng chạy thật khi làm plan (Supabase Postgres).
