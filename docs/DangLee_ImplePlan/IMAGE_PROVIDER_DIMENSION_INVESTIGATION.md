# Provider ảnh và dimension — kết quả kiểm tra 2026-10-23

Chỉ đọc cấu hình, GET metadata và source chính thức. Không sinh ảnh, sửa code/service/DB hoặc resume Boston smoke.

Cập nhật sau điều tra: user đã duyệt mapping requested/wire và tính năng dimension đã triển khai/kiểm chứng riêng; xem [dimension report](ASSET_GENERATION_DIMENSIONS_REPORT.md). Những dòng “chưa approve/chưa thực hiện” bên dưới mô tả thời điểm điều tra trước approval, không phải trạng thái triển khai hiện tại. Smoke vẫn PAUSED.

## Cấu hình Cartoon đang chạy

- `.env`: `NINE_ROUTER_BASE_URL` chọn router; `IMAGE_MODEL` chọn model/provider prefix. Key giữ riêng, không đưa vào báo cáo.
- Docker Compose `x-runtime-env` truyền các biến này cho app/worker. Runtime worker hiện dùng `https://router.studev.net/v1` và `ag/gemini-3.1-flash-image`.
- `src/lib/ninerouter/client.ts`: `config()` đọc endpoint/key; `requireModel()` đọc model; `generateImage()` POST images/generations với JSON **chỉ model/prompt**.
- `src/worker/asset-jobs.ts`: renderVariant gọi generateImage bằng IMAGE_MODEL; chưa có preset/request size trong đường chạy hiện tại.
- Provider/account upstream nằm trong dịch vụ 9router, không có router container/source trong repo Cartoon. Dashboard theo cấu trúc upstream: `https://router.studev.net/dashboard/providers/antigravity` (chưa xác minh quyền đăng nhập/dashboard của user).

## Metadata đọc trực tiếp từ deployment

- GET `/api/version`: currentVersion **0.5.104**, latestVersion **0.5.109** tại thời điểm kiểm tra.
- GET `/v1/models/image`: một model `ag/gemini-3.1-flash-image`, owned_by `ag`.
- GET `/v1/models/info?id=ag%2Fgemini-3.1-flash-image`: kind=image, endpoint=/v1/images/generations, capabilities=[textToImage]; không có params/options/dimensions về size.
- Query param metadata đúng là `id`, không phải `model`; lượt dò bằng `model` trả400 rồi đã được sửa thành `id`. Đây không phải lỗi generation/provider.

## Đối chiếu source bản phát hành 0.5.104

NPM metadata `https://registry.npmjs.org/9router/0.5.104` trỏ gitHead `6ed886857da125f4908a8a3c3e64f7f1d8ff8366`. Runtime báo version khớp release, nhưng chưa kiểm trực tiếp code server để loại trừ custom patch.

1. [Registry Antigravity](https://github.com/decolua/9router/blob/6ed886857da125f4908a8a3c3e64f7f1d8ff8366/open-sse/providers/registry/antigravity.js): id=`antigravity`, alias=`ag`.
2. [Image adapter](https://github.com/decolua/9router/blob/6ed886857da125f4908a8a3c3e64f7f1d8ff8366/open-sse/handlers/imageProviders/antigravity.js#L38): đọc body.size, gọi sizeToAspectRatio rồi thêm suffix tỷ lệ vào model trước khi gọi executor. Không đọc body.aspect_ratio trong bản này.
3. [sizeToAspectRatio](https://github.com/decolua/9router/blob/6ed886857da125f4908a8a3c3e64f7f1d8ff8366/open-sse/handlers/imageProviders/_base.js#L9): chỉ có bảng dưới, mọi chuỗi khác fallback1:1.

| size ở wire request | aspect ratio được map |
|---|---|
| 1024x1024 | 1:1 |
| 1792x1024 | 16:9 |
| 1024x1792 | 9:16 |
| 1536x1024 | 3:2 |
| 1024x1536 | 2:3 |
| **1920x1080 hoặc1080x1920** | **1:1 do fallback** |

4. [Executor](https://github.com/decolua/9router/blob/6ed886857da125f4908a8a3c3e64f7f1d8ff8366/open-sse/executors/antigravity.js#L71): mặc định aspectRatio1:1; đọc suffix model dạng16x9, đưa vào generationConfig.imageConfig.aspectRatio, bỏ suffix khi gọi model thật. Không cấu hình imageSize/native pixel trong nhánh này.

Kết luận source: `size` là đầu vào để router chọn **tỷ lệ**, không bảo đảm độ phân giải pixel. Với request Cartoon hiện không gửi size/suffix, executor release này mặc định1:1; phù hợp ảnh smoke1024×1024. Chưa gọi model để xác minh behavior size trên deployment.

Ghi chú sửa nhận định trước: tài liệu tổng quát nói adapter `gemini` bỏ qua size; **không được áp câu đó cho adapter `antigravity`/alias `ag`**. Master tại commit `f39d8f07481ae8518e93175f0ecaaafa61573c6c` có thêm aspect_ratio explicit ưu tiên trước size, nhưng bảng size vẫn không có1920x1080. Không mặc định deployment có tính năng master; không tự upgrade router.

## Hệ quả cho plan dimension

Plan gửi nguyên1920x1080 sẽ không đạt mục tiêu ngang nếu router dùng release stock0.5.104. Cần chốt bổ sung **requested preset khác transport size cho provider** trước implementation.

Đề xuất ít đụng hạ tầng: giữ UI/DB requested1920x1080, map wire size1792x1024 riêng cho Antigravity0.5.104; dọc1080x1920 map1024x1792. Giữ source/processed thật, warning pixel mismatch với requested và ghi transport size trong metrics. Không gọi1792x1024 là native1920x1080 hoặc tỷ lệ ảnh trả thực; source phải đo lại. Đây là đề xuất mới, **chưa sửa contract/code hoặc được approve**.

Phương án khác: maintainer router sửa sizeToAspectRatio để suy tỷ lệ từ dimension/allowlist, hoặc nâng bản đã xác minh có aspect_ratio rồi gửi tỷ lệ explicit. Đây là thay đổi dịch vụ ngoài Cartoon, chưa có quyền quản trị được xác minh và chưa thực hiện.
