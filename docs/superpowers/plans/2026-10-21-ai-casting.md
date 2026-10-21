# AI Casting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trước khi viết kịch bản, AI đề xuất asset mới và biến thể còn thiếu; hệ thống sinh ảnh và chặn việc viết kịch bản cho tới khi mọi đề xuất đã duyệt hoặc bỏ.

**Architecture:** Bảng `asset_proposals` theo dõi đề xuất của từng design; job `casting.propose` gọi model viết, kiểm tra máy rồi đẩy các job sinh ảnh có sẵn. Duyệt ảnh (ở bất kỳ trang nào) cập nhật đề xuất khớp và, với ảnh gốc, đẩy job cho các biến thể đang chờ. Cổng chặn kiểm ở giao diện, `createScript` và `script.generate`.

**Tech Stack:** Như hiện tại (Next.js 15.5.28, Drizzle 0.45.4, zod 4, pgmq, 9router).

**Spec:** `docs/superpowers/specs/2026-10-21-ai-casting-design.md`

## Global Constraints

- Không có test tự động (AGENTS.md luật 4–6); xác minh bằng `tsc`, lint, build, chạy thật.
- Schema đúng spec §4 (enum `proposal_kind`, `proposal_decision`, bảng `asset_proposals`, `casting` trước `scripting` trong `video_status`).
- Trần kỹ thuật: 20 asset mới, 40 biến thể, 30 `useAssets` trong khuôn zod.
- Không dùng LangGraph cho casting.
- Chạy thật tốn khoảng 1 lời gọi LLM casting + N ảnh (N = số đề xuất) + 1–3 lời gọi kịch bản.
- Commit theo luật 7, kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Tasks

### Task 1: Schema, migration, thư viện casting
- [ ] `schema.ts`: thêm `casting` đầu `videoStatus`, default của `videos.status` thành `casting`; enum `proposalKind` (`asset`, `variant`), `proposalDecision` (`open`, `approved`, `dropped`); bảng `assetProposals` (cột theo spec §4.2, `unique(video_id, asset_id, state)`, `video_id` → `videos.id` ON DELETE CASCADE).
- [ ] `npx drizzle-kit generate --name ai_casting`; kiểm SQL có `ALTER TYPE "video_status" ADD VALUE 'casting' BEFORE 'scripting'` (sửa tay nếu thiếu `BEFORE`). Áp bằng `npm run db:migrate`.
- [ ] `src/lib/casting/schema.ts` (khuôn `castingSchema`, kiểu `CastingV1`), `check.ts` (`checkCasting(c, ctx)` → `{ result, issues }`, loại đề xuất sai thay vì thất bại cả lượt), `prompts.ts` (`castingMessages`), `queries.ts` (`getCasting`, `openProposalCount`, `resolveProposalsAfterApproval`, `dropProposalById`).
- [ ] `tsc`, lint; commit `feat(casting): add asset proposal schema and casting contract`.

### Task 2: Job `casting.propose` và cổng ở job kịch bản
- [ ] `src/worker/casting-jobs.ts`: idempotent (đã có đề xuất thì bỏ qua); gọi `LLM_WRITER_MODEL`; `extractJson` → `castingSchema` (bỏ khóa `$schema`); `checkCasting`; trong một transaction ghi `asset_proposals`; đẩy `asset.generate_base` cho asset mới (assetId tạo trước, seriesId của design) và `asset.generate_variant` cho biến thể của asset có sẵn; ghi `validations` (`l1-casting-v1`); trả `useAssets` trong metrics.
- [ ] Đăng ký job; `script.generate` thất bại vĩnh viễn khi còn đề xuất `open`.
- [ ] `tsc`, lint; commit `feat(worker): add casting.propose job and gate script generation`.

### Task 3: Hook duyệt ảnh và action
- [ ] `approveVariant` gọi `resolveProposalsAfterApproval(assetId, state)`: chuyển đề xuất khớp sang `approved`; nếu là ảnh gốc thì đẩy `asset.generate_variant` cho các đề xuất biến thể `open` của asset đó. `refreshAsset` làm mới thêm `/designs` (layout).
- [ ] `createDesign`: bỏ phần chọn asset; tạo design `casting` và đẩy `casting.propose`. `createScript`: kiểm `openProposalCount = 0`, đặt `status = scripting`. Action mới `dropProposal`, `retryCasting` (khi chưa có đề xuất và job casting gần nhất `failed`).
- [ ] `tsc`, lint; commit `feat(designs): require casting approval before script writing`.

### Task 4: Tab Casting
- [ ] `src/app/designs/[id]/casting/page.tsx`: tổng số và số còn mở; mỗi đề xuất có loại, khóa/tên, lý do, ảnh, trạng thái, `VariantReview` (duyệt/loại/sinh lại) và nút Bỏ; asset có sẵn để tick (mặc định = `useAssets` + đề xuất đã duyệt); `StartScriptForm` chỉ bật khi không còn đề xuất mở; `AutoRefresh` khi còn job.
- [ ] Tab "Casting" đứng đầu trong `design-tabs.tsx`; tab Kịch bản khi `status = casting` hiện hướng dẫn; form tạo design bỏ danh sách asset và chuyển tới tab Casting.
- [ ] `tsc`, lint, build; commit `feat(ui): add casting tab for design asset proposals`.

### Task 5: Chạy thật và tài liệu
- [ ] Theo spec §8 (5 bước kiểm chứng). Cập nhật `CLAUDE.md`, `README.md`; commit `docs: describe ai casting flow`.
