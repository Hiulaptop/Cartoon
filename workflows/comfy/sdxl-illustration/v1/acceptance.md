# SDXL illustration v1 — hồ sơ nghiệm thu

Ngày: 2026-10-30. Spec/plan: `docs/superpowers/{specs/2026-10-30-comfyui-workflow-pack-design.md,plans/2026-10-30-comfyui-workflow-pack.md}` từ repo root.

## Inventory

- Repo package/lock: Next 15.5.28, React 19.1.0, Remotion 4.0.537, Geist 1.8.1, sharp 0.35.5, TypeScript 5.9.3.
- Historical: sáu ledger `data/spikes/comfy-video-20261030/{sky-day,sky-sunset,farm-dry,farm-grown,habit-seed,habit-tree}.json` đều succeeded, 7 node. Đây là demo cũ, không phải nghiệm thu pack mới.
- Live GET lúc 2026-10-30T11:50:40Z: ComfyUI 0.43.2, frontend 1.57.4, Python 3.13.12, PyTorch 2.12.0+rocm7.14.0; RX 7700 XT, VRAM 12,868,124,672 byte. Các node CheckpointLoaderSimple, CLIPTextEncode, EmptyLatentImage, KSampler, VAEDecode, SaveImage có mặt. Queue rỗng lúc đọc; không phải khóa độc quyền và không bảo đảm rỗng về sau.
- Checkpoint loader liệt kê `sd_xl_base_1.0.safetensors`. Đọc file local: 6,938,078,334 byte; SHA-256 khớp `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b` bằng Get-FileHash. Không tải/cài/cập nhật gì.

## Trạng thái

| Hạng mục | Trạng thái | Bằng chứng/giới hạn |
|---|---|---|
| Giai đoạn 0 inventory | passed | GET local và đọc/hash artifact, không POST prompt |
| Đóng gói đủ sáu file | passed | Đủ sáu artifact, không weights/media |
| Cấu trúc graph/preset/hash | passed | Node inline inspection exit 0; không thay thế nghiệm thu UI/generation |
| UI serializer mở/serialize/mở lại/API export | passed | Frontend 1.57.4 thực tế, 7 node, không lỗi node, fixed seed, semantic match; bằng chứng bên dưới |
| UI File menu/OS file picker end-to-end | pending | Chưa thực hiện menu download/import; serializer không chứng nhận luồng này |
| Bố cục | passed | Đã xem full frontend screenshot; 7 node/4 nhóm không đè node; cần zoom/pan để đọc prompt |
| Generation science | pending | Chưa được cấp quyền lượt mới |
| Generation pixel-farm | pending | Chưa được cấp quyền lượt mới |
| Generation minimal | pending | Chưa được cấp quyền lượt mới |
| Production | not_released | Không đăng ký registry, không đổi flag/DB/config |

## Bằng chứng frontend

Evidence paths sau tính từ repo root, không đóng gói media vào sáu file pack:

- `data/spikes/comfy-workflow-pack-20261030/final-frontend-evidence.json`: lúc 2026-10-30T11:57:58.230Z, ComfyUI 0.43.2/frontend 1.57.4; workflow raw SHA-256 `84262a063ac1324f836db6f7a3ba22ece8eac20ef5821c5f75a6071f3530f11b`; bảy node không reported errors và seed control fixed.
- `final-reopened-workflow.json` và `final-exported-api.json` cùng thư mục: frontend loadGraphData → graph.serialize → loadGraphData → graphToPrompt. UI format 0.4; semantic equality với API bàn giao sau chỉ bỏ `_meta`, không bỏ seed/prefix/model/settings/link. Export raw SHA-256 `f1cdd13e269af3fb2e0456fdd2469b432cba7f08eebda776fad3b4a430e6d023`.
- `workflow-editor-full.png` cùng thư mục: full frontend screenshot đã xem, có widget/text/link. Chụp canvas-only `workflow-canvas.png` không chứa đầy đủ DOM text nên không dùng nó để chứng nhận chữ bị mất trong UI. Screenshot dùng zoom/pan của phiên riêng, không thay metadata file.
- T3 browser snapshot/evaluate timeout; dùng Chrome đã cài cùng Remotion trong phiên tách biệt, không tải browser hoặc start ComfyUI. Chặn hàm queuePrompt trong phiên thao tác; không bấm Run/gửi prompt. Chưa thao tác File menu/OS download/import end-to-end.
- Đã xử lý race startup: app.graph tồn tại trước khi default workflow load xong; chờ frontend hoàn tất graph loads rồi mới import. Không lọc node template dư để ép semantic match. Lần cuối có đúng IDs 3–9.
- Capture CDP ban đầu lỗi do đọc nhầm wrapper kết quả sau khi evidence đã ghi; sửa đọc trường `value.data`, full screenshot lệnh sau exit 0. Shell quoting lần đầu cũng lỗi trước khi chạy browser; không có generation từ các lần lỗi.
- Frontend có cảnh báo 404 user.css/userdata và unknown assets.seed messages; chúng không ngăn serializer/export. Không sửa cấu hình để giấu cảnh báo; đây không phải nghiệm thu toàn bộ frontend.

## Kiem artifact cuoi

Node inline (node:fs/node:crypto/assert, không tạo file test) exit 0: đủ sáu file; JSON parse; raw/canonical hashes; so baseline sky-day chỉ khác prefix; đối chiếu prompt/negative/seed của ba preset với ledger cũ; 7 node/9 links UI→API, semantic export, fixed seed và bindings/settings; scan path riêng/key rõ ràng không có phát hiện. Đây là kiểm artifact, không phải test suite, generation hoặc đánh giá quyền thương mại.

Whitespace: `git diff --check` exit 0 cho tracked diff. `git diff --no-index --check -- /dev/null <file>` cho từng file pack/spec/plan không có whitespace diagnostics; exit 1 biểu thị có file mới khác input rỗng, không coi đó là exit 0. Không stage file để kiểm.

Không chạy lint/typecheck/build vì chỉ tạo JSON/Markdown, không đổi app code/dependency. Không tạo/chạy test, không gọi generation/paid API/start/restart/migration/commit/push. Static checks không chứng nhận chất lượng hình ảnh; chờ quyền runtime riêng và user xem output.

## Review độc lập cuối

Reviewer hoàn tất ngày 2026-10-30: không Critical; một Important về tên menu đã sửa trong README sau đối chiếu bundle cài thực tế (`Open Workflow`, `Export Workflow (API Format)`, khác tên trong docs). Không thay graph/UI/preset đã hash. Ba minor chưa xử lý: dây MODEL/VAE đi sau node Positive; evidence local/gitignored không đi cùng clone; ghi chú Context7 mang tính thời điểm phiên. Các điểm này không chặn bàn giao artifact, không nâng menu/generation thành passed. Chi tiết quyết định và giới hạn review trong ledger local của plan.

## Giới hạn

Không tự sinh ảnh trong nghiệm thu cấu trúc/UI. Preset chọn bằng cách dán prompt/negative và seed thủ công; không có selector tự động. Tên file/prompt không chứng minh ảnh đúng nội dung hoặc các cảnh có continuity. Qwen/Remotion nằm ngoài pack.
