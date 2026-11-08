# SDXL illustration v1

Workflow **sinh ảnh**, không phải pipeline video toàn phần. Một graph 7 node, 6 loại core node; không custom node. Qwen (giọng) và Remotion (motion/chữ/ghép MP4) vẫn nằm ngoài ComfyUI.

## File và trạng thái

- `workflow.json`: mở/chỉnh trong ComfyUI, có bố cục và bốn nhóm Model / Prompts / Sampling / Output.
- `workflow-api.json`: graph thực thi standalone, không phải request body `/prompt` và không chứa layout.
- `presets.json`: ba bộ prompt; default `science`. **Không có dropdown tự áp dụng preset.**
- `manifest.json`: hashes/provenance/bindings của pack, không phải production WorkflowRelease.
- `acceptance.md`: bằng chứng và phần còn pending.

Đã kiểm inventory và serializer round-trip trên ComfyUI **0.43.2**, frontend **1.57.4**, workflow format **0.4**. Chưa kiểm thao tác File menu/OS file picker từ đầu đến cuối; chưa sinh ảnh mới từ pack, chưa được user duyệt nội dung. Không xem checksum hoặc JSON hợp lệ là bằng chứng generation thành công. Registry production không đăng ký pack.

Repo tham chiếu: Next.js 15.5.28, React 19.1.0, Remotion 4.0.537, TypeScript 5.9.3; không đổi dependency.

## Chuẩn bị và mở

1. Dùng ComfyUI local đã chạy và model đã có. Pack không tự khởi động dịch vụ hoặc tải/cài gì.
2. Lưu riêng workflow đang làm của bạn trước. Trong workflow/tab riêng, dùng lệnh **Open Workflow** (`Comfy.OpenWorkflow`; reviewer ghi nhận nhãn menu **Open** trên frontend 1.57.4), chọn `workflow.json` của thư mục này. Tài liệu chính thức gọi thao tác này là **File → Load**; khác tên Load/Open không tự chứng minh lệch phiên bản. Chưa xác nhận vị trí chính xác trong cây menu/file picker end-to-end. Nếu không tìm thấy lệnh tương ứng, kiểm phiên bản; không tự chuyển model/node.
3. Kiểm node model chọn đúng `sd_xl_base_1.0.safetensors`. File chuẩn: **6,938,078,334 byte**, SHA-256 `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`. Tên trùng không chứng minh nội dung trùng; kiểm hash file checkpoint thực tế.
4. Kiểm đủ 7 node, không node thiếu/đỏ; zoom/pan để đọc prompt và widget. Thiếu model/node, hash khác hoặc version mismatch: **dừng**, không fallback/download/update.

## Chọn preset thủ công

Mở `presets.json`, chọn một record rồi copy:

| ID | Positive node 6 | Negative node 7 | Seed node 3 |
|---|---|---|---|
| science | trường `positive` của science | trường `negative` cùng record | 730100 |
| pixel-farm | trường `positive` của pixel-farm | trường `negative` cùng record | 730103 |
| minimal | trường `positive` của minimal | trường `negative` cùng record | 730104 |

Dán vào widget **text** của hai CLIPTextEncode và widget **seed** của KSampler. Giữ **control after generate = fixed**. Title positive vẫn nói default Science dù bạn đã dán preset khác; title không phải bộ chọn preset hoặc bằng chứng input đang dùng. Muốn đổi chủ thể, chỉnh positive có chủ đích và lưu thành bản làm việc riêng; preset/hash/evidence của bản gốc không còn chứng nhận bản đã chỉnh.

Giữ settings chung: **1024×576**, **batch 1**, **24 steps**, **CFG 6.5**, **euler**, **normal**, **denoise 1**. Chỉ kích thước này nằm trong phạm vi pack; widget nhập được số khác không chứng minh hỗ trợ. Cùng seed không bảo đảm ảnh pixel-identical trên runtime/GPU khác.

Prefix mặc định node 9: `cartoon_workflow_sdxl_v1`. Khi được cấp quyền generation, dùng prefix tương đối riêng theo lượt/preset để phân biệt output; không dùng absolute path hoặc `..`.

## Lưu và đối soát — không cần bấm Run

1. **File → Save** (Ctrl+S) để lưu bản UI riêng; không ghi đè artifact pack hoặc demo cũ.
2. Mở lại bản vừa lưu bằng lệnh **Open Workflow** (menu **Open**), kiểm model/settings và fixed seed.
3. Dùng lệnh **Export Workflow (API Format)** (`Comfy.ExportWorkflowAPI`; nhãn menu **Export (API)** theo reviewer), lưu riêng để đối soát với `workflow-api.json`. Tài liệu chính thức gọi là **File → Export Workflow (API)**; chưa xác nhận đường dẫn menu end-to-end trên bản cài này.
4. So node IDs, `class_type` và **toàn bộ** `inputs`/links; có thể loại `_meta` không thực thi. Không bỏ qua seed/prompt/prefix/model/size để ép kết quả khớp. Nếu đã áp preset khác thì chỉ các binding prompt/negative/seed dự kiến đổi; không gọi đó là khớp default science byte-for-byte.

Bằng chứng hiện có dùng các phương thức serializer/loadGraphData/graphToPrompt của frontend cài thực tế trong browser riêng, không bấm menu hoặc Run. API export tương ứng default science; UI không báo lỗi node. Xem giới hạn trong acceptance.

## Sinh ảnh là cổng quyền riêng

Việc mở/lưu/export không yêu cầu generation. **Duyệt plan không cấp quyền sinh ảnh.** Nghiệm thu mới đề xuất tối đa ba ảnh (mỗi preset một ảnh), tuần tự, batch 1; chỉ thực hiện sau quyền riêng. Không chạy runner demo sáu ảnh để thay thế bước này. Không clear/cancel/interrupt công việc khác. Nếu POST có kết quả không rõ, giữ prompt ID/trạng thái và đối soát history, không submit lại mù quáng.

Khi được phép: giữ graph thực tế/seed/model/prefix/version/prompt ID, lấy output từ node 9; kiểm PNG giải mã được, 1024×576, tối đa 25 MiB/16 triệu pixel, hash ảnh và user duyệt trực quan trước khi đánh dấu đạt nội dung. Hiện cả ba preset vẫn pending.

## Hash và sửa đổi

`artifacts.*.rawSha256` là hash **bytes file**; `apiCanonicalSha256` là SHA-256 JSON API đầy đủ sau sort object keys đệ quy và giữ array order. Semantic comparison frontend bỏ `_meta` là phép so khác, không phải canonical hash này. Không so hash UI với hash API để suy ra tương đương. Manifest không hash chính nó.

Sau mọi thay đổi UI/API/preset: tính lại hash, kiểm round-trip nếu liên quan, hạ trạng thái evidence không còn tương ứng. Không sửa model/hash để che mismatch. Khôi phục bằng bản pack gốc có hash khớp hoặc lưu revision mới; không ghi đè evidence cũ. Pack này không được import vào production registry và không bật flag execution.

## Giới hạn nội dung và nguồn

Ảnh science là minh họa, không là bằng chứng khoa học. Không bảo đảm continuity nhân vật/địa điểm, trước–sau tăng trưởng, đúng chủ thể tuyệt đối hoặc không có chữ giả/logo. Typography/phụ đề nên dựng sau bằng Remotion, không yêu cầu model vẽ chữ. Người vận hành phải kiểm quyền sử dụng và chất lượng từng output.

- Model chính thức: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 — CreativeML Open RAIL++-M; đọc model card/license và các hạn chế. Không phải public domain; pack không bảo đảm clearance thương mại cho mọi output/mục đích.
- File → Load/Save/Export Workflow (API): https://docs.comfy.org/development/api-development/workflow-api-format.md
- UI format: https://docs.comfy.org/specs/workflow_json.md (frontend version khác workflow schema version).
- API routes: https://docs.comfy.org/development/comfyui-server/comms_routes

Context7 không có tool khả dụng trong phiên; dùng nguồn chính thức trên và serializer bản cài thực tế. Không restart/update ComfyUI, đổi network/config, migration, paid API, upload, commit hoặc push trong quá trình đóng gói.
