# Thiết kế: AI đề xuất asset trước khi viết kịch bản (Casting)

- Ngày: 2026-10-21
- Trạng thái: **chờ user duyệt** (AGENTS.md luật 3: có thay đổi schema và hợp đồng dữ liệu)
- Liên quan: `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md` (spec gốc), `docs/superpowers/specs/2026-10-21-series-project-design.md` (bộ phim, project, bản thiết kế), `docs/standards/asset-naming.md`.

## 1. Mục tiêu

Cho AI mở hơn: trước khi viết kịch bản, AI được **đề xuất asset mới** (nhân vật, bối cảnh, đạo cụ, hiệu ứng) và **biến thể còn thiếu** của asset có sẵn. Mọi đề xuất được sinh ảnh tự động và đưa vào bước duyệt. **Người dùng phải duyệt (hoặc bỏ) hết đề xuất rồi mới viết kịch bản.**

## 2. Quyết định đã chốt (với user, 2026-10-21)

| # | Quyết định |
|---|---|
| 1 | **Hai pha**: pha Casting (đề xuất → sinh → duyệt) trước, pha viết kịch bản sau. Kịch bản không bao giờ tham chiếu asset chưa duyệt; kiểm tra lớp 1 của kịch bản giữ nguyên. |
| 2 | AI đề xuất được **asset mới và biến thể còn thiếu** (của asset có sẵn và của asset mới). |
| 3 | Mỗi đề xuất có ba lựa chọn: **Duyệt**, **Loại và sinh lại** (kèm lý do, như hiện nay), **Bỏ** (không dùng). |
| 4 | **Không giới hạn** số đề xuất theo nghiệp vụ; chỉ có **trần kỹ thuật** trong khuôn JSON: tối đa **20 asset mới** và **40 biến thể** mỗi lần đề xuất. |
| 5 | Không dùng LangGraph cho casting: đây là các job tuần tự với cổng duyệt của người lưu trong DB (theo spec gốc §3 "duyệt giữa các bước là trạng thái trong DB, không phải `interrupt()`"). |

## 3. Luồng

```
Tạo design (bộ phim, brief, thời lượng)
  → video.status = casting, job casting.propose
  → AI trả khuôn CastingV1 → kiểm tra máy → tạo asset_proposals + đẩy job sinh ảnh
  → Tab Casting: người dùng duyệt / loại (sinh lại) / bỏ từng đề xuất, có thể tick thêm asset có sẵn
  → Khi mọi đề xuất ở trạng thái approved hoặc dropped: nút "Viết kịch bản" mở
  → video.status = scripting, viết kịch bản như M4 với: useAssets + đề xuất đã duyệt + asset tick thêm
  → phân cảnh, render, upload như cũ
```

- Nếu AI không đề xuất gì: casting xong ngay, người dùng bấm "Viết kịch bản".
- **Sinh ảnh:**
  - Asset mới đi qua `asset.generate_base` (job có sẵn), với `assetId` do hệ thống tạo trước và `seriesId` của design. Asset thuộc **bộ phim**, nên tập sau dùng lại được.
  - Biến thể của asset có sẵn (đã duyệt ảnh gốc) đi qua `asset.generate_variant` ngay.
  - Biến thể của **asset mới** chỉ được đẩy job **sau khi** ảnh gốc của asset đó được duyệt, vì biến thể dựa trên mô tả đã chốt (quy tắc hiện có: chỉ sinh biến thể khi asset đã duyệt). Khi duyệt ảnh gốc, hệ thống tìm các đề xuất biến thể đang `open` của asset đó và đẩy job.
- **Bỏ** một đề xuất asset mới cũng bỏ luôn các đề xuất biến thể của asset đó. Asset đã sinh vẫn nằm trong bộ phim ở trạng thái chưa duyệt; người dùng có thể xử lý sau ở trang bộ phim.
- **Cổng chặn** được kiểm tra ở ba chỗ: nút trên giao diện, server action `createScript` và job `script.generate` (job thất bại vĩnh viễn nếu còn đề xuất `open`).

## 4. Hợp đồng dữ liệu (cần duyệt)

### 4.1 Khuôn đầu ra `CastingV1` (zod, `src/lib/casting/schema.ts`)

| Trường | Ràng buộc |
|---|---|
| `version` | literal `1` |
| `useAssets[]` | tên asset có sẵn của bộ phim (`chr_...`, `bg_...`); tối đa 30 |
| `newAssets[]` | tối đa **20**; mỗi phần tử: `key` (`^[a-z][a-z0-9_]{0,23}$`, khóa tạm để biến thể trỏ tới), `kind` (`chr`/`bg`/`prop`/`fx`), `displayName` (1–60), `brief` (10–400, mô tả ngắn để sinh asset), `reason` (5–300), `states[]` (trạng thái muốn có ngoài `base`, theo danh sách cho phép của loại) |
| `newVariants[]` | tối đa **40**; mỗi phần tử: `asset` (tên asset **có sẵn**), `state` (trong danh sách cho phép, khác `base`, chưa có ảnh đã duyệt), `reason` (5–300) |

Kiểm tra máy (không LLM), đề xuất sai bị loại khỏi danh sách và ghi vào `validations`:
- tên trong `useAssets`/`newVariants.asset` phải là asset của bộ phim;
- trạng thái nằm trong danh sách cho phép của loại;
- biến thể chưa có ảnh đã duyệt;
- bỏ trùng lặp;
- `key` của `newAssets` duy nhất.

### 4.2 Bảng mới `asset_proposals`

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `id` | uuid PK | |
| `video_id` | uuid NOT NULL → `videos.id` ON DELETE CASCADE | Design đề xuất |
| `kind` | enum `proposal_kind` (`asset`, `variant`) | |
| `asset_id` | uuid NOT NULL | Asset mới: id tạo trước (hàng `assets` xuất hiện khi job sinh xong, nên **không** có khóa ngoại). Biến thể: asset có sẵn hoặc asset mới của cùng đợt |
| `state` | text NOT NULL | `base` với đề xuất asset; trạng thái với đề xuất biến thể |
| `brief` | text NOT NULL default `''` | Mô tả AI đưa cho asset mới |
| `reason` | text NOT NULL | Lý do AI cần |
| `decision` | enum `proposal_decision` (`open`, `approved`, `dropped`) default `open` | `approved` khi biến thể/ảnh gốc tương ứng được duyệt |
| `created_at` | timestamptz | |

Ràng buộc: `UNIQUE (video_id, asset_id, state)`.

Duyệt/loại ảnh vẫn nằm ở `assets`/`asset_variants`/`reviews` như hiện tại; bảng này chỉ theo dõi đề xuất của từng design và quyết định "bỏ". Khi ảnh gốc hay biến thể tương ứng được duyệt (ở bất kỳ trang nào), `decision` của đề xuất khớp chuyển sang `approved`.

### 4.3 Enum `video_status`

Thêm giá trị `casting` **trước** `scripting`; design mới tạo có `status = casting`. Postgres cho `ALTER TYPE ... ADD VALUE ... BEFORE`; kiểm SQL do `drizzle-kit generate` sinh ra khi làm plan.

### 4.4 Job mới

- **`casting.propose`** `{ videoId }`: gọi `LLM_WRITER_MODEL`, kiểm tra máy, ghi `asset_proposals` và đẩy job sinh ảnh, ghi `validations` (`target_type = video`, `validator_model = layer1`, `rubric_version = l1-casting-v1`). Job idempotent: nếu design đã có đề xuất thì không gọi lại model.
- Không thêm loại job sinh ảnh mới; dùng lại `asset.generate_base` / `asset.generate_variant`.

## 5. Giao diện

- Tab mới **"Casting"** (đứng đầu) trong trang `/designs/[id]`:
  - danh sách đề xuất: loại, tên hoặc khóa tạm, lý do AI, ảnh, trạng thái;
  - với mỗi đề xuất: Duyệt (ảnh gốc có form chốt tên như bước 1) / Loại và sinh lại (lý do bắt buộc) / Bỏ;
  - danh sách asset có sẵn để tick thêm;
  - tổng số đề xuất và số còn mở;
  - nút **"Viết kịch bản"** chỉ bật khi không còn đề xuất `open`;
  - tự làm mới khi còn job đang chạy;
  - nút "Đề xuất lại" (chạy lại `casting.propose` với lý do) **ngoài phạm vi** lát này.
- Form tạo design bỏ danh sách tick asset (chuyển sang tab Casting); vẫn chọn bộ phim, tiêu đề, brief, thời lượng.
- Tab "Kịch bản" khi `status = casting` hiện hướng dẫn quay lại tab Casting.

## 6. Ảnh hưởng tới code

| Khu vực | Thay đổi |
|---|---|
| `src/lib/db/schema.ts` + migration | Enum `proposal_kind`, `proposal_decision`; bảng `asset_proposals`; giá trị `casting` của `video_status` |
| `src/lib/casting/` (mới) | `schema.ts` (khuôn), `check.ts` (kiểm tra máy), `prompts.ts`, `queries.ts` (trạng thái cổng) |
| `src/worker/casting-jobs.ts` (mới), `handlers.ts`, `src/lib/queue/jobs.ts` | Job `casting.propose` |
| `src/app/series/asset-actions.ts` | Khi duyệt ảnh gốc: đẩy job cho đề xuất biến thể đang mở của asset đó; khi duyệt ảnh: chuyển đề xuất khớp sang `approved` |
| `src/app/designs/actions.ts` | `createDesign` tạo design `casting` + đẩy `casting.propose`; `createScript` kiểm tra cổng và gom danh sách asset; action mới `dropProposal` |
| `src/worker/script-jobs.ts` | Từ chối khi còn đề xuất `open` |
| `src/app/designs/[id]/casting/page.tsx`, `src/components/designs/*` | Tab Casting |
| Tài liệu | `CLAUDE.md`, `README.md` |

## 7. Rủi ro

- **Chi phí không giới hạn:** mỗi đề xuất khoảng 1 lời gọi LLM và 1 ảnh (15–50 giây). Trần kỹ thuật 20 asset / 40 biến thể chỉ chặn đầu ra bất thường. Tab Casting hiện tổng số để người dùng thấy.
- **Biến thể không giữ được nhân vật:** model ảnh hiện tại không giữ nhân vật giữa các biến thể (kết luận M0), nên casting sẽ đẩy nhiều biến thể vào hàng duyệt; người duyệt vẫn là chốt chặn.
- **Worker xử lý tuần tự:** một đợt casting nhiều đề xuất xếp hàng lâu (ví dụ 10 ảnh × khoảng 30 giây ≈ 5 phút).
- **Asset bị bỏ vẫn còn trong bộ phim:** asset mới bị "Bỏ" sau khi đã sinh vẫn nằm trong bộ phim. Chưa có xóa asset ở lát này.
- Thêm giá trị enum trong Postgres không đảo ngược được bằng migration đơn giản.

## 8. Kiểm thử

Theo AGENTS.md luật 4–6: không có test tự động. Xác minh bằng `tsc`, lint, build và chạy thật:
1. Tạo design với brief cần nhân vật mới: thấy đề xuất, ảnh được sinh, nút "Viết kịch bản" bị khóa.
2. Duyệt ảnh gốc asset mới: các biến thể của nó được đẩy job.
3. Bỏ một đề xuất, loại kèm lý do một đề xuất khác.
4. Khi hết đề xuất `open`: viết kịch bản dùng được asset mới.
5. Gọi thẳng action/job khi còn đề xuất `open`: bị chặn.

## 9. Ngoài phạm vi

Đề xuất lại (re-casting) sau khi đã viết kịch bản; xóa asset; ước lượng chi phí tiền; AI tự duyệt; đề xuất trong lúc phân cảnh.
