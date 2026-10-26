# Thiết kế: chọn model theo từng request cho 5 bước LLM của bài giảng

- Ngày: 2026-10-25
- Trạng thái: **Thiết kế được user duyệt trong chat ngày 2026-10-25 kèm chỉ thị tự động thực thi; spec viết ngắn để lưu lại quyết định, không chờ duyệt văn bản. Đã triển khai và kiểm tay (xem mục 6).**
- Phạm vi: một route đọc, một component chọn model, nối field `model` qua server action → `algorithm_generation_runs.inputSnapshot` → worker. **Không đổi schema DB, không đổi hợp đồng JSON của model** (`contracts.ts`), không đổi DSL.
- Liên quan: `2026-10-23-algorithm-video-design.md`, `2026-10-25-voice-pipeline-design.md`.

## 1. Mục tiêu và quyết định

Model hiện cố định bằng biến môi trường (`LLM_WRITER_MODEL`, `LLM_JUDGE_MODEL`, `IMAGE_MODEL`). User muốn chọn model cho từng bước, lấy từ router, hiện trên frontend, và gửi kèm request để backend dùng.

| # | Quyết định (user duyệt 2026-10-25) |
|---|---|
| 1 | Không lưu cấu hình cố định. Mỗi lần bắt đầu một bước, user bấm "Tải danh sách model", chọn, và model đi kèm chính request |
| 2 | Áp dụng cho 5 bước LLM của bài giảng: Lời giải (kể cả "từ chối và sinh lại"), Combo, Kịch bản, Voice (khi tạo mới), Animation |
| 3 | Model nằm trong `inputSnapshot` của generation run (jsonb sẵn có) và trong fingerprint yêu cầu; worker đọc từ đó, dự phòng `LLM_WRITER_MODEL` |
| 4 | Ngoài phạm vi: model ảnh, nhánh hoạt hình và giám khảo, cấu hình chung/ghi đè theo design |

## 2. Đối chiếu (2026-10-25)

- `GET {NINE_ROUTER_BASE_URL}/models` trả `{ object, data: [{ id, object, owned_by, capabilities: { imageOutput, reasoning, ... }, context_length, max_completion_tokens }] }`; đo được 30 model (nhà cung cấp `ag`, `mmf`, `oc`).
- Chỗ gọi model: `requireModel("LLM_WRITER_MODEL")` ở `algorithm-solution-jobs.ts`, `algorithm-stage-jobs.ts` (combo, script, animation), `algorithm-voice-jobs.ts`. `generation_runs.model` và `revisions.model` đã tồn tại và được worker ghi model thực tế.
- Hai lưu ý trong CLAUDE.md: model có trong `/models` vẫn có thể bị upstream trả 404; mã chung app + worker không import `server-only`.

## 3. Thiết kế

1. **`src/lib/ninerouter/models.ts`**: `listChatModels()` gọi `/models`, bỏ model có `capabilities.imageOutput === true`, trả `{ id, owner, contextLength, maxOutput, reasoning }[]` sắp theo `id`; cache bộ nhớ 5 phút; lỗi mạng/HTTP ném `Error` (không cache lỗi). `assertKnownModel(id)` ném lỗi tiếng Việt nếu `id` không có trong danh sách (không âm thầm dùng model khác).
2. **`GET /api/models`** (`dynamic = "force-dynamic"`, chỉ đọc): `{ models, defaultModel, fetchedAt }`, `defaultModel = process.env.LLM_WRITER_MODEL ?? null`. API key chỉ ở server.
3. **`ModelPicker`** (client): nút "Tải danh sách model" gọi route, hiện `<select name="model">` với mục đầu "Mặc định (tên model)"; mỗi dòng ghi id, nhà cung cấp, context; trạng thái đang tải và lỗi; nhớ lựa chọn theo `scope` trong `localStorage` (bọc `try/catch`, chỉ khôi phục nếu model còn trong danh sách đã tải). Khi chưa tải, form gửi `model` rỗng (dùng mặc định).
4. **Server action**: field `model` tùy chọn; rỗng thì bỏ qua; có giá trị thì `assertKnownModel`. Truyền xuống `enqueueSolutionGeneration`, `rejectAndRegenerateSolution`, `prepareStageRevision` (combo/script/animation) và `beginVoice`. Model được thêm vào `inputSnapshot` và vào fingerprint yêu cầu.
5. **Worker**: `resolveWriterModel(snapshot)` (`src/lib/algorithm/model.ts`) trả `snapshot.model` nếu là chuỗi không rỗng, ngược lại `requireModel("LLM_WRITER_MODEL")`. Dùng ở job lời giải, combo/script/animation, voice.
6. **Hiển thị**: `StepHeader` nhận `model` của revision hiện hành (`revisions.model`) và hiện "Model: …".

## 4. Lỗi và biên

- Router không tải được danh sách: nút báo lỗi, vẫn bắt đầu bước được với "Mặc định".
- Model không có trong danh sách khi gửi: action trả lỗi (toast), không tạo job.
- Router từ chối model lúc job chạy (404 upstream): job lỗi hạ tầng, runner thử lại 3 lần rồi `failed`, hiện qua thanh job như hiện nay. Thử lại dùng đúng model đã chọn vì nằm trong snapshot bất biến.
- `localStorage` bị chặn: picker vẫn hoạt động, không nhớ lựa chọn.

## 5. Kiểm chứng

Theo AGENTS.md luật 4–6: không viết/chạy test. Dùng `npm run lint`, `npx tsc --noEmit`, `npm run build`, rồi kiểm tay: tải danh sách ở một bước, chọn model khác mặc định, chạy bước, xác nhận `generation_runs.model` và dòng "Model:" đúng; thử model không hợp lệ qua form; thử khi không chọn (dùng mặc định). Ghi rõ điều đã xem thật và điều chưa.

## 6. Kết quả triển khai và kiểm tay (2026-10-25)

Đã làm: `models.ts`, `GET /api/models`, `ModelPicker` (5 bước), `resolveWriterModel`/`chosenModel`, nối action → snapshot → worker, dòng "Model:" ở `StepHeader`. `tsc`, eslint, `npm run build` đạt.

Đã kiểm tay trên một design thử: route trả 30 model chat; picker hiện mặc định + 30 model; model giả bị từ chối bằng toast và không tạo job; chọn `ag/gemini-3.8-flash-medium` cho bước Lời giải thì `inputSnapshot.model` đúng như đã chọn, job thành công, lựa chọn giữ nguyên sau khi gửi form. Router trả tên model khác id đã chọn (`gemini-3.8-flash-n`), nên giao diện hiện cả hai.

Chưa kiểm: bốn bước còn lại (combo, kịch bản, voice, animation) với model được chọn (cùng đường code nhưng chưa chạy từng bước); nhớ lựa chọn bằng `localStorage` sau khi tải lại trang; giao diện ở 360 px và chế độ tối; lỗi khi router không trả `/models` (chỉ viết xử lý, chưa thử). Hai design nháp "Thử chọn model" và "Thử chọn model 2" còn trong DB (bảng có ràng buộc `restrict` nên không xóa được qua app); design đầu đã duyệt đề và có một lời giải thử.
