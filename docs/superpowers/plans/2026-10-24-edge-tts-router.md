# Edge TTS qua 9router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Tạo voiceover Edge TTS qua endpoint 9router chung, kể cả khi discovery chưa công bố voice nhưng server đã cấu hình voice rõ ràng.

**Architecture:** Hợp nhất discovery và allowlist Edge cấu hình server; tái dùng action, audio.generate, review và timeline. Giữ nguyên synthesis contract model/input và persistent claim hiện tại.

**Tech Stack:** Next15.5.28, React19.1.0, Remotion4.0.537, Mediabunny1.61.6, Node22 Docker; không thêm dependency.

**Spec:** `docs/superpowers/specs/2026-10-24-edge-tts-router-design.md`

## Global Constraints

- Chờ duyệt spec/plan trước implementation; inline execution, không commit/push.
- Không schema/migration/DB type/DSL/timeline contract changes.
- Không tạo/sửa/chạy formal tests; chỉ lint/typecheck/build và manual smoke được yêu cầu riêng.
- Một outbound synthesis attempt/take; không tự retry/fallback, không approval tự động.
- Credential server hiện có; không sao chép secret từ ảnh, không log raw upstream errors.
- Không Python, package mới, nâng phiên bản hoặc sửa router admin.

## Review Focus

- Discovery rỗng/502: voice cấu hình vẫn chọn được, cảnh báo nguồn đúng, upload vẫn hoạt động.
- Browser sửa wire ID: server action và worker cùng từ chối ngoài allowlist.
- Cấu hình lỗi/trùng/provider khác: báo rõ trước enqueue; không fallback âm thầm.
- Voice bị gỡ sau enqueue: chặn trước claim/POST; take hoàn tất không bị vô hiệu hóa.
- Timeout/HTTP lỗi/redelivery: không gửi synthesis lần hai, không tạo take approved giả.

## Voice casting đã chốt

User đã chọn Puno = `edge-tts/en-US-GuyNeural`, Eli = `edge-tts/en-US-BrianMultilingualNeural`. Audition ba voice đã thành công. Cấu hình chỉ hai voice đã chọn; production smoke riêng dùng Guy. Chưa có approval implementation mới.

## Task 1: Catalog Edge có cấu hình rõ

**Prerequisite mới theo yêu cầu user:** hoàn tất khảo sát/standalone audition được phép và user chọn cặp voice trước mọi implementation. Không tự cấu hình William. Thay William ở Task2/Task3 bằng voice user chốt; giữ smoke một request riêng. Audition ba request theo research không phải smoke production hoặc quyền triển khai.

**Files:** Create `src/lib/ninerouter/edge-tts-config.ts`; modify `src/lib/ninerouter/tts.ts`; document `.env.example` (đối chiếu tên template thực tế trước sửa).

**Interfaces:** `readConfiguredEdgeVoices(): TtsVoiceOption[]`, chỉ server; `listTtsModels(): Promise<TtsModelOption[]>` và `resolveTtsModel(wireModelId)` giữ return contract. Helper trạng thái riêng `getTtsCatalog(): Promise<{models:TtsModelOption[];warning?:string}>`; `listTtsModels` delegate helper. Tránh vòng import bằng type-only imports hoặc đặt parser nhận shape local tương đương.

- [ ] Đọc source hiện tại, package/lock/Dockerfile và spec đầy đủ; ghi ledger/baseline các file bị sửa, giữ mọi dirty file kế thừa.
- [ ] Parse env strict theo giới hạn spec; không giá trị default ngầm. Template chỉ chứa ví dụ không secret, giải thích optional allowlist không chứng minh upstream hoạt động.
- [ ] Tách lỗi discovery khỏi lỗi config; hợp nhất/khử trùng wire ID, ưu tiên discovery. Khi không có config và discovery lỗi, trả catalog rỗng kèm cảnh báo; không làm hỏng upload page.
- [ ] Resolve từ cùng catalog/config tại action và worker; giữ chặn ID lạ và semantics take đã hoàn tất. Không POST trong list/resolve.
- [ ] Chạy ESLint các file sửa và root `npx tsc --noEmit`; kiểm tra source cho năm Review Focus liên quan mà không tạo/chạy test.

## Task 2: UI và vận hành local

**Files:** Modify `src/app/designs/[id]/voiceover/page.tsx`, `src/components/audio/take-list.tsx`; chỉ sửa component form hiện có nếu cần sau đọc source. Modify `docker-compose.yml` chỉ nếu env forwarding thực tế không chuyển biến mới tới cả app/worker. Create `docs/DangLee_ImplePlan/EDGE_TTS_ROUTER_REPORT.md`.

**Interfaces:** page tiêu thụ `getTtsCatalog`, form tiếp tục gửi `modelId` đầy đủ; take-list đọc `modelMetadata` hiện có. Không thêm browser-secret hoặc public env.

- [ ] Hiển thị nhóm/voice, cảnh báo catalog và model/voice của take; không tự submit/chọn một voice ngầm để tạo giọng. Upload luôn còn dùng được.
- [ ] Xác minh env propagation app và worker từ Compose hiện có. Khi triển khai được duyệt, bổ sung biến allowlist Guy và Brian vào `.env` privately; không in file hoặc credential. Không thay endpoint/key.
- [ ] Chạy `npm run lint`, `npx tsc --noEmit`, `npm run build`, `docker compose build app worker` theo service names thực tế; không chạy test.
- [ ] Sau triển khai local được duyệt, mở UI đọc catalog và kiểm tra voice Guy và Brian xuất hiện/cảnh báo đúng, không phát sinh audio.generate.
- [ ] Ghi report actual commands/results, API discovery status, phần chưa nghiệm thu; một fresh source reviewer theo executing-plans, xử lý findings trong scope.

## Task 3: Manual smoke có yêu cầu riêng

**Files:** Evidence dưới ignored `data/experiments/remotion-edge-tts/<run-id>/`; cập nhật report, không tạo formal test helper/fixture.

- [ ] Chỉ khi user yêu cầu chạy smoke: dùng design Heist `5d560c7d-4f4b-4d3e-bd26-ee8b949a87a1`, tạo đúng một take/job qua action/queue thật, voice Guy, câu mẫu trong spec, request ID mới.
- [ ] Chờ kết quả, ghi job/take IDs, codec/duration/bytes/SHA256 và một outbound attempt; lỗi thì dừng, không retry. Nghe playback để đánh giá phát âm và file hợp lệ; không tự tuyên bố nghe nếu chỉ probe metadata.
- [ ] Giữ take pending_review, bàn giao link nghe. Không duyệt script/layout/scenes/timeline hoặc xuất MP4; các gate Heist còn nguyên.

## Handoff

Chỉ planning đã được yêu cầu. Trình spec và plan, chờ user duyệt trước code. Khuyến nghị thực hiện inline như các phần trước vì delta nhỏ, dùng chung catalog giữa server action và worker. Approval implementation và yêu cầu smoke là hai phạm vi riêng.
