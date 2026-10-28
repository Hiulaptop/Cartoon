# Rà soát Implementation Plan A

Ngày: 2026-10-22. Tài liệu được rà soát: `IMPLEMENTATION_PLAN_A.md`.
Branch chuẩn bị: `feat/pipeline-a-i2v`, tạo từ `master` tại `be0a148`.

## Kết luận

Hướng Frame 0 → biên dịch chuyển động → I2V → QA → nối cảnh hợp lý để phát triển một pipeline mới. Tài liệu hiện là blueprint, chưa đủ chặt để agent tự triển khai an toàn vào Cartoon. Cần đặc tả tích hợp và quyết định engine trước khi viết code; không diễn giải nội dung tự động thực thi trong blueprint thành quyền sửa schema hoặc chạy test.

Lượt này chỉ rà soát và tạo branch; không sửa mã ứng dụng, schema, migration, cấu hình pipeline hay tài liệu gốc. Các thay đổi Docker local chưa commit có sẵn trong workspace vẫn được giữ nguyên; branch không tự cô lập những thay đổi chưa commit này.

## Hiện trạng đã đối chiếu

Phiên bản thực tế từ `package.json` và `package-lock.json`: Next.js 15.5.28, React 19.1.0, Remotion 4.0.537, Sharp 0.35.5, Zod 4.6.7, Drizzle ORM 0.45.4, Supabase CLI 2.121.0. Dockerfile dùng Node 22 cho app/worker.

- `src/worker/render-jobs.ts`: render Scene DSL bằng Remotion, xuất MP4 và đưa về `pending_review`; chưa có đường thực thi I2V.
- `src/lib/scene/schema.ts`: Scene DSL v1, 1920×1080, 30 FPS; thời gian cảnh tính bằng frame của timeline này.
- `src/lib/ninerouter/client.ts`: client dùng fetch tới 9router đã có; `ChatMessage.content` chỉ nhận string. Chưa có content ảnh, response schema hay tham số `reasoning_effort` trong giao diện hiện tại.
- `src/lib/assets/image.ts`: đã có Sharp để chuẩn hóa PNG/tách nền/cắt sát asset; chưa có bộ chọn vùng nhân vật theo cỡ cảnh, hoặc bước dựng ảnh hoàn chỉnh Frame 0.
- `src/worker/scene-graph.ts`: đã có vòng viết → kiểm máy → giám khảo → sửa, nhưng đang kiểm Scene DSL bằng văn bản, không phải video/ảnh I2V.
- `src/lib/queue/jobs.ts`, `src/worker/runner.ts`: đã có hàng đợi, theo dõi job và retry; không có loại job I2V. Worker cho tối đa 3 attempts và visibility timeout 300 giây, có `extendLock` cho handler.
- `src/lib/db/schema.ts`: có scenes/renders/job_runs, nhưng chưa đặc tả nơi lưu clip mỗi cảnh, engine submission ID, phiên bản prompt, Frame 0/last frame, QA và liên kết chuỗi.

Chưa có `.ua/knowledge-graph.json` ở thời điểm rà soát. Kết luận dựa trên đọc trực tiếp các module nêu trên, không dựa vào graph chưa tồn tại. Không chạy phân tích graph toàn repo trong lượt rà soát có phạm vi này.

## Phân loại module

| Module | Phân loại | Phần dùng lại và phần thiếu |
|---|---|---|
| A1 Frame Prep | INTEGRATE + bổ sung bước tạo Frame 0 | Dùng lại Sharp/storage; cần ảnh cảnh đầy đủ, vùng crop/bounding box và quy tắc giữ nhân vật/đạo cụ trong khung. |
| A2 Motion Compiler | INTEGRATE, logic compiler mới | Dùng lại client 9router, JSON parser và cấu trúc kiểm dữ liệu hiện có; cần hỗ trợ ảnh, output contract và guardrails riêng. |
| A3 I2V Dispatcher | BUILD_NEW | Chưa có ComfyUI/video API adapter; dùng lại worker/queue/storage để điều phối và lưu kết quả. |
| A4 Chainer + Vision QA | BUILD_NEW, dùng lại hạ tầng | MP4/storage/job infrastructure đã có; chưa có trích frame, QA thị giác, chuỗi phụ thuộc và retry theo clip. |

Không module nào hiện đủ điều kiện SKIP toàn bộ cho pipeline A hoàn chỉnh.

## Các điểm cần sửa trước khi thực thi

### 1. Chưa chốt ranh giới với pipeline Remotion hiện tại — quan trọng

Plan chưa nói pipeline A là lựa chọn riêng hay thay thế Scene DSL/render hiện tại. Cần xác định đường đi từ series/project/design tới scene clip và MP4 cuối, cách chọn pipeline, preview, duyệt/reject và upload. Không đưa motion prompt vào `scenes.dsl` v1 rồi để renderer hiện tại đọc như DSL cũ.

Repo đã có TypeScript, Sharp và Zod. Không cần mặc định thêm Python/Pydantic/Pillow chỉ vì blueprint liệt kê chúng. Sharp có API crop/resize phù hợp [1]; nếu chọn Python service thì cần nêu lý do, image, queue boundary và hợp đồng liên tiến trình riêng.

### 2. Thiếu nguồn Frame 0 và thông tin crop — quan trọng

Asset nhân vật đã tách nền không tương đương ảnh đầu cảnh có nhân vật + nền + đạo cụ. Cần quyết định Frame 0 được upload, dựng từ bố cục hiện tại hay sinh bằng model. Enum `full_shot/medium_shot/close_up` không tự cung cấp tọa độ khuôn mặt; phải có vùng crop do người chọn hoặc cơ chế phát hiện được kiểm định. Cần lưu ảnh gốc và phép biến đổi, tránh ghi đè asset đã duyệt.

### 3. Thông số engine không thể khóa chung — quan trọng

`81 frames`, CFG và `parallel-single` phải thuộc profile của checkpoint/workflow cụ thể, không phải cam kết chống méo mặt chung. Wan 2.2 có các biến thể 5B/14B khác nhau [2]. `parallel-single` có xuất hiện trong custom node của UtilsCollection [3], nhưng cần pin repo/commit, class/node ID và workflow API JSON thực tế; không chỉ tự tìm node theo tên rồi inject mù.

LTX-2 có ràng buộc số frame dạng 8k+1 và kích thước theo bội số 32 trong CLI chính thức [4]. Vì vậy 1280×720 cần làm rõ padding/cropping theo workflow; 832×480 lại không có tỷ lệ 16:9 chính xác. Cần phân biệt resolution suy luận và resolution đầu ra.

81 frame đánh số từ 0 kết thúc ở index 80, không phải 81. 81 frame phát ở 16 FPS cho duration container 5.0625 giây; khoảng thời gian giữa frame đầu và cuối là 5 giây. Phải chốt quy ước, cách bỏ frame neo trùng khi ghép, và chuẩn hóa sang timeline 30 FPS của repo.

### 4. 9router và hợp đồng đa phương thức chưa được xác nhận — quan trọng

Tên combo/model trong plan là cấu hình triển khai cần xác minh trên router đang chạy. Chưa có bằng chứng ở lượt rà soát này rằng `agy-flash-continuity`, các tên Gemini liệt kê, ảnh đầu vào, structured output và `reasoning_effort=low` đều được từng tuyến fallback hỗ trợ. Không coi mô hình là miễn phí chỉ từ tên/tiền tố.

Client hiện tại cần một hợp đồng ảnh + JSON rõ ràng. `localhost:20128` ở trong worker container trỏ chính worker; nếu router ở Windows host phải có endpoint theo môi trường Docker, không hardcode URL của blueprint.

### 5. QA, chọn candidate và retry chưa đủ điều kiện kết thúc — quan trọng

Thiếu thang điểm/threshold `identity_score`, hướng và miền giá trị `morph_risk_score`, quy tắc hòa điểm, trường hợp cả 3 candidate đều không hợp lệ, QA trả JSON lỗi hoặc router timeout. Tự chấm candidate là heuristic, không thay thế kiểm tra kết quả video.

Worker có 3 attempts; nếu mỗi attempt thực hiện lại 1 render + 2 QA retries thì có thể thành 9 lần render cho một cảnh. Cần tách lỗi vận chuyển khỏi lỗi chất lượng, lưu submission/result để tiếp tục job, đặt idempotency key, ngân sách render/chi phí tổng, heartbeat, deadline và cancellation. Không để retry cả job vô tình nhân đôi việc gọi GPU/API.

### 6. Chuỗi last-frame có thể tích lũy drift — quan trọng

Chỉ so Frame 0 của clip hiện tại với frame cuối sẽ không phát hiện tốt drift nhỏ tích lũy qua nhiều clip; cũng bỏ sót lỗi xuất hiện ở giữa clip. Cần giữ anchor gốc/canon để đối chiếu, chọn thêm frame theo thời gian và xác định lúc re-anchor. Cắt cảnh hoặc đổi cỡ cảnh không phải lúc nào cũng được dùng nguyên frame cuối của cảnh trước. Cần quy định xử lý khi một cảnh trước bị reject hoặc sinh lại để vô hiệu hóa clip phụ thuộc phía sau.

### 7. Các chốt kiểm dữ liệu và style cần diễn đạt chính xác

Giới hạn 50–80 từ, anchor dưới 10 từ và tối đa 4 style tags là chính sách sản phẩm, không phải bảo đảm chất lượng từ engine. Cần định nghĩa cách đếm từ/keyword phrase, thứ tự trường, xử lý 0 candidate hợp lệ và giới hạn số lần sửa. Plan nhắc cả 2D/3D tags nhưng QA lại mặc định drift 2D→3D: phải có style đích rõ ràng cho từng pipeline/project.

### 8. Phần pytest/tự thực thi xung đột luật repo

AGENTS.md luật 4–6 không cho agent tự viết hoặc chạy test. Các đoạn yêu cầu tự tạo pytest, mock và chạy thử trong blueprint không thay thế yêu cầu user phải chỉ định test rõ ràng và duyệt plan test. Luật 3 cũng yêu cầu spec + plan + phê duyệt riêng trước khi sửa schema/hợp đồng dữ liệu. Việc tạo branch và rà soát tài liệu không phải phê duyệt triển khai những thay đổi đó.

## Điều kiện để chuyển sang triển khai

1. Chốt pipeline A cùng tồn tại hay thay thế phần nào của Remotion; nguồn Frame 0 và hành vi preview/duyệt.
2. Chọn một engine/checkpoint/workflow đầu tiên, vị trí GPU/API, profile kỹ thuật và giới hạn tài nguyên/chi phí.
3. Xác nhận capability của combo 9router trên router thật; không gọi sinh nội dung chỉ để khám phá danh sách model.
4. Viết spec và plan tích hợp chứa hợp đồng dữ liệu, lưu trữ/versioning, job state/retry/idempotency và tiêu chí QA; được user phê duyệt trước khi thực hiện.

## Nguồn kiểm chứng

Context7 đã resolve/query ComfyUI docs và Sharp 0.35.5; nguồn chính thức đối chiếu:

1. [Sharp 0.35.5 resize/extract](https://github.com/lovell/sharp/blob/v0.35.5/docs/src/content/docs/api-resize.md).
2. [ComfyUI: Wan 2.2 workflow và các biến thể model](https://docs.comfy.org/tutorials/video/wan/wan2_2).
3. [Repo tác giả ComfyUI-UtilsCollection](https://github.com/silveroxides/ComfyUI-UtilsCollection).
4. [Lightricks LTX-2: CLI arguments và constraints](https://github.com/Lightricks/LTX-2/blob/main/packages/ltx-pipelines/src/ltx_pipelines/utils/args.py).

Nguồn online ở nhánh main có thể thay đổi; lúc triển khai phải pin đúng revision của workflow/node/checkpoint được chọn.
