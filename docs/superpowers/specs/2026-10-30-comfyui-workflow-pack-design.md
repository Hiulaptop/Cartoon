# ComfyUI workflow pack — thiết kế giai đoạn 0–1

Ngày: 2026-10-30

Trạng thái: **user đã duyệt written spec trong chat ngày 2026-10-30** bằng phản hồi “Duyệt” sau khi nhận liên kết tài liệu. Sau đó user đã duyệt implementation plan và chọn Native trong chat cùng ngày. Triển khai giai đoạn 0–1 theo plan; không cấp quyền chạy generation.

## 1. Mục tiêu và ý định

Người dùng muốn phát triển kênh tiếng Anh và có workflow thật để mở, chỉnh, dùng lại trong ComfyUI, thay vì chỉ nhận video ghép từ các script demo.

Giai đoạn 0–1 bàn giao một workflow SDXL text-to-image local có bản giao diện và bản API tương ứng, ba preset hình ảnh, provenance và hướng dẫn sử dụng/nghiệm thu. Không biến graph ảnh thành lời hứa về pipeline video toàn phần.

Kiến trúc dài hạn đã chọn: app điều phối; ComfyUI sinh hình; Qwen sinh giọng; Remotion dựng video. Giai đoạn 2–5 và node cầu nối giọng/render nằm ngoài spec này.

### Thành công

- Người dùng mở được workflow, hiểu các nhóm node và biết chỉnh prompt/seed/kích thước.
- Một graph dùng chung cho science illustration, Pixel Farm và minimal illustration; không sao chép ba graph độc lập chỉ khác prompt.
- Bản API và giao diện tương ứng về thực thi, có bằng chứng export từ frontend thực tế.
- Có nguồn model, checksum, phiên bản, giới hạn và lịch sử artifact.
- Phân biệt rõ hoàn thành đóng gói, nghiệm thu giao diện, nghiệm thu sinh ảnh và phát hành production.

## 2. Hiện trạng và bằng chứng

### Repo đã đối chiếu package.json/package-lock.json

- Next.js 15.5.28, React 19.1.0, Remotion 4.0.537.
- Geist 1.8.1, sharp 0.35.5, TypeScript 5.9.3 (phiên bản lockfile).
- Không thêm/đổi dependency npm hoặc Python cho workflow pack.
- Checkout có nhiều thay đổi chưa commit; giữ nguyên, không reset/stash/commit hay chỉnh file ngoài phạm vi.

### Demo ảnh đã chạy

`src/worker/comfy-demo-generate.mjs` tạo graph bằng code rồi POST /prompt. Sáu ledger dưới `data/spikes/comfy-video-20261030/` đều ghi succeeded và giữ graph/prompt ID/hash ảnh. Đây là bằng chứng chạy graph ảnh, không là bằng chứng đã lưu workflow giao diện.

Graph có **7 node thuộc 6 loại**, với ID hiện hữu:

| ID | Loại | Vai trò |
|---|---|---|
| 4 | CheckpointLoaderSimple | SDXL model/CLIP/VAE |
| 5 | EmptyLatentImage | latent 1024×576, batch 1 |
| 6 | CLIPTextEncode | positive |
| 7 | CLIPTextEncode | negative |
| 3 | KSampler | lấy mẫu |
| 8 | VAEDecode | giải mã |
| 9 | SaveImage | một ảnh output |

Bản ghi môi trường ngày 2026-10-30: ComfyUI 0.43.2, frontend 1.57.4, Python 3.13.12, PyTorch 2.12.0+rocm7.14.0, AMD RX 7700 XT khoảng 12 GB VRAM. Đây là snapshot lịch sử; phải đọc lại runtime trước nghiệm thu mới. Không suy ra CUDA/NVIDIA từ nhãn device cuda:0.

Model đã dùng: `sd_xl_base_1.0.safetensors`, 6,938,078,334 byte, SHA-256 `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`. Nguồn chính thức: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0 . License ghi nhận CreativeML Open RAIL++-M; phải giữ dẫn chiếu license, không kết luận đây là public domain hay bảo đảm đủ quyền cho mọi cách sử dụng thương mại.

Không có workflow pack trong `workflows/` ở thời điểm viết. `src/lib/comfy/registry.ts` có registry rỗng; foundation production chưa phát hành workflow. Spec pilot cũ mô tả thời điểm chưa tải model: tài liệu này bổ sung trạng thái mới, không sửa ngược bằng chứng lịch sử.

Qwen và Remotion của ba video tiếng Anh chạy ngoài ComfyUI; không có node giọng/render được nghiệm thu trong graph này.

## 3. Phạm vi và giới hạn quyền

### Bao gồm

1. Kiểm kê chỉ đọc các artifact/code đã có và API local cần thiết, không tự start dịch vụ.
2. Đóng gói graph đã chạy thành workflow giao diện có bố cục và bản API.
3. Ba preset, manifest provenance, hướng dẫn vận hành và hồ sơ nghiệm thu.
4. Hướng dẫn chọn preset bằng thao tác chỉnh widget thủ công trong ComfyUI; không hứa dropdown preset mới.

### Không bao gồm

- Custom node, model mới, LoRA, ControlNet, image-to-image, tách nền, nhân vật nhất quán, motion/video diffusion.
- Qwen node, FFmpeg/Remotion node, script điều phối pipeline mới, upload YouTube, nhạc hoặc API trả phí.
- Đổi DB, job contract, production registry, feature flag, .env, Docker/network/firewall/listen address.
- Apply migration 0015/0016/0017, bật app/worker/tunnel, restart hoặc update ComfyUI.
- Tự viết/sửa/chạy test, fixture hoặc mock; không commit/push nếu chưa được yêu cầu riêng.

Duyệt spec/plan không tự cấp quyền chạy generation mới. Bất kỳ lượt sinh mới nào phải có số lượng và mục đích được user cho phép rõ ràng. Không dùng lại hạn mức sáu ảnh của demo đã hoàn thành.

## 4. Artifact bàn giao và ranh giới dữ liệu

Thư mục dự kiến: `workflows/comfy/sdxl-illustration/v1/`.

- `workflow.json`: workflow giao diện có node/link/widget/layout và nhóm chức năng.
- `workflow-api.json`: graph thực thi standalone, chưa bọc request /prompt.
- `presets.json`: ba bộ prompt có ID ổn định: `science`, `pixel-farm`, `minimal`.
- `manifest.json`: thông tin pack và hashes; không phải production WorkflowRelease.
- `README.md`: cách mở/chỉnh/export, chọn preset thủ công, giới hạn, nguồn và cách đối soát.
- `acceptance.md`: checklist và trạng thái bằng chứng; không đánh dấu đạt khi chưa thực hiện.

Không lưu model weights, ảnh/video hoặc absolute path riêng của máy vào pack. Ảnh/bằng chứng runtime mới đặt ở thư mục mới trong `data/spikes/`, không ghi đè demo cũ. Không ghi token, URL có credential hoặc toàn bộ environment vào manifest.

### Manifest pack version 1

Ghi tối thiểu: pack ID `sdxl-illustration`, revision `v1`, model filename/hash/size/source/license, hash raw bytes của workflow UI/API/presets, canonical hash graph API, phiên bản Comfy/frontend đã quan sát và trạng thái nghiệm thu, fixed settings, allowed size, bindings và output ID.

Hash raw file dùng xác minh artifact byte-for-byte. Canonical hash dùng quy tắc sort đệ quy object keys, giữ thứ tự array như `canonicalHash` hiện có. Không coi raw SHA và canonical SHA là cùng loại. Hash UI không được so trực tiếp với hash API để kết luận tương đương.

Manifest không import vào registry và không thêm field vào `WorkflowReleaseSchema`. Nếu sau này phát hành production, cần review riêng để chuyển manifest sang contract sẵn có, chốt quyền chạy và nghiệm thu.

## 5. Hành vi workflow và preset

### Graph cơ sở

Giữ node ID, kết nối và các tham số đã có bằng chứng chạy. Không chọn model thay thế nếu checkpoint không tồn tại hoặc hash khác.

- Model: SDXL Base 1.0 nêu trên.
- Kích thước mặc định và kích thước đã nghiệm thu đầu tiên: **1024×576**.
- Batch: **1**, một SaveImage.
- KSampler: steps **24**, CFG **6.5**, sampler **euler**, scheduler **normal**, denoise **1**.
- Seed mặc định **730100**; khóa seed, không randomize/increment sau mỗi lượt ở cấu hình bàn giao. Hướng dẫn thao tác thủ công nếu muốn biến đổi seed.
- Kích thước khác không được quảng cáo hỗ trợ chỉ vì widget nhập được; cần nghiệm thu và revision riêng trước khi mở rộng danh sách.
- Output prefix mặc định tương đối `cartoon_workflow_sdxl_v1`, không path tuyệt đối/traversal. Chạy nghiệm thu dùng prefix riêng để phân biệt lượt, không ghi đè artifact cũ.

Bindings: positive `6.text`, negative `7.text`, seed `3.seed`, width/height/batch `5.width/height/batch_size`, prefix `9.filename_prefix`; output node **9**.

### Giao diện

Bố trí theo thứ tự model → prompt tích cực/tiêu cực → latent và sampler → decode/output. Nhóm dùng metadata frontend, không thêm node thực thi tùy ý. Đặt nhãn dễ hiểu và ghi rõ model cần có, batch 1, kích thước đã nghiệm thu, preset chọn thủ công.

Không tự đoán thứ tự widgets hoặc schema tương thích từ phiên bản frontend. Đọc object_info và serializer/export của bản cài thực tế; ưu tiên mở graph thực tế rồi lưu/xuất bằng frontend. Schema validity không thay thế UI round-trip. Không tự cài validator mới để chứng nhận giả tương thích.

### Preset

Mỗi preset có ID, tên, mục đích, positive, negative, example subject và seed tham chiếu; dùng chung model/size/sampler của pack. Default UI/API dùng cùng preset science và seed mặc định; hai preset còn lại là dữ liệu tham khảo để dán vào đúng widget, không tự áp dụng.

- Science: minh họa biên tập, cảnh rộng, không chữ/logo. Ảnh không là bằng chứng khoa học.
- Pixel Farm: pixel art, khu vườn, cảnh rộng; không tuyên bố giữ nguyên địa điểm hoặc tạo trước/sau. Prompt dry trước đây ra vườn xanh nên không lấy tên file làm bằng chứng ngữ nghĩa.
- Minimal: minh họa đơn giản, ít vật thể, không gian đặt chữ; không hứa hình ảnh chính xác tuyệt đối theo prompt.

Không thêm chữ/phụ đề trực tiếp vào prompt ảnh. Typography tiếp tục thuộc Remotion ở giai đoạn sau.

## 6. Tương đương UI/API và phiên bản

Nghiệm thu theo ba lớp, ghi riêng:

1. **Cấu trúc tĩnh:** JSON đọc được; node/link đúng; không đường dẫn bí mật; đúng model/settings/bindings; hash khớp. Đây không chứng minh chạy được.
2. **Frontend round-trip, không generation:** mở workflow, kiểm node/widget/link; lưu; mở lại; export API trên frontend được kiểm tra. So sánh node thực thi, inputs và liên kết với API bàn giao. Có thể bỏ `_meta.title` và layout khỏi phép so sánh semantic, không bỏ tham số thực thi. Bất kỳ thay đổi seed/prompt/size/model hoặc link đều là mismatch cần giải quyết. Không bấm Run trong bước này.
3. **Generation nghiệm thu có quyền riêng:** ít nhất một ảnh mới cho mỗi preset để đóng nghiệm thu cả ba preset; đề xuất hạn mức tối đa **3 ảnh, tuần tự, batch 1**, nhưng chưa được cấp quyền. Nếu chỉ được phép một ảnh thì chỉ đánh dấu preset đó đạt, hai preset còn lại pending.

Đổi workflow/API/preset sau nghiệm thu phải cập nhật hash và trạng thái tương ứng. Cùng seed không bảo đảm pixel giống qua GPU/runtime/version khác; không yêu cầu pixel identity để kết luận graph semantic tương ứng.

## 7. Nghiệm thu runtime và an toàn

Nếu ComfyUI đang tắt, chỉ báo blocked; không tự start. GET chỉ đọc có thể dùng /system_stats, /object_info theo các class cần thiết và /queue để kiểm kê. Không POST prompt trong kiểm kê.

Sau quyền chạy riêng:

- Kiểm graph/model/size trước submit và queue không có công việc khác; không clear/cancel/interrupt job của người dùng.
- Chạy tuần tự, không tăng batch hoặc tự sinh ảnh thay thế nếu prompt chưa đạt.
- Ghi trạng thái trước POST, nhận và lưu prompt ID. Timeout/response không rõ không tự POST lại; đối soát queue/history và giữ trạng thái chưa xác định.
- Đọc đúng SaveImage node 9; output PNG phải giải mã được, 1024×576, tối đa 25 MiB/16 triệu pixel như giới hạn pilot.
- Lưu graph đã dùng, prompt/negative, seed, model/hash, prefix, prompt ID, kích thước/hash ảnh và phiên bản quan sát. Không cần DB mới.
- Người dùng duyệt trực quan đúng chủ thể/phong cách, lỗi hình, chữ giả/logo và tính phù hợp; đạt kỹ thuật không tự thành đạt nội dung.

Lượt kiểm tra lỗi runtime phát sinh generation bổ sung hoặc tác động queue không nằm trong hạn mức mặc định; không tự tạo để xác minh.

## 8. Tiêu chí bàn giao và trạng thái cần báo

- Giai đoạn 0: có inventory và ranh giới rõ; các bằng chứng cũ ghi ngày và không giả là snapshot live.
- Đóng gói giai đoạn 1: đủ artifact, hashes, presets và hướng dẫn; source/static review hoàn thành.
- Giao diện: đã mở/lưu/mở lại/export trên phiên bản cụ thể, hoặc ghi pending/blocked.
- Sinh ảnh: ghi đạt riêng từng preset theo quyền được cấp, hoặc pending; không tuyên bố cả workflow đã nghiệm thu khi chỉ có JSON.
- Production: **chưa phát hành**, registry rỗng và cấu hình execution giữ nguyên.

Theo AGENTS.md: không tạo/sửa/chạy test files, fixtures hoặc mocks. Kiểm JSON/hash/source là kiểm tra artifact, không tạo bộ test riêng. Lint/typecheck/build chỉ cần nếu có code liên quan thay đổi; tài liệu dùng diff --check và self-review. Mọi kết quả phải nêu lệnh hoặc thao tác thực tế, không suy ra từ code nhìn đúng.

## 9. Thứ tự tiếp theo và cổng phê duyệt

1. User duyệt tài liệu này.
2. Viết implementation plan theo file và bước, có cách kiểm chứng không dùng test; xin duyệt plan và phương thức thực hiện.
3. Thực hiện giai đoạn 0 và đóng gói giai đoạn 1 trong đúng phạm vi.
4. Nghiệm thu UI không generation; xin quyền riêng cho tối đa ba ảnh nếu chưa được cấp.
5. Bàn giao workflow pack và các trạng thái đã/chưa nghiệm thu. Chỉ sau đó mới đặc tả giai đoạn giọng/video.

Không diễn giải duyệt lộ trình/spec là duyệt migration, generation, cài node/model, commit hoặc publish.

## 10. Nguồn chính thống và giới hạn xác minh

Context7 không khả dụng trong phiên (tool lookup không có kết quả); dùng tài liệu ComfyUI chính thức:

- UI/API export, load và khác biệt layout: https://docs.comfy.org/development/api-development/workflow-api-format.md
- Workflow UI JSON schema: https://docs.comfy.org/specs/workflow_json.md
- Local server routes: https://docs.comfy.org/development/comfyui-server/comms_routes
- Model nguồn/license: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0

Schema tài liệu hiện mô tả workflow version 1 và dẫn tới legacy 0.4; version frontend không phải version schema. Không chốt format chỉ theo trí nhớ: chọn format frontend thực tế export/load được và ghi lại trong manifest. Tài liệu chính thức không chứng nhận riêng tương thích frontend 1.57.4; cần bằng chứng round-trip như mục 6.

Spec liên quan: `docs/superpowers/specs/2026-10-30-comfyui-asset-pilot-design.md`. Tài liệu này không thay thế phạm vi hoặc cơ chế durable run của production pilot.
