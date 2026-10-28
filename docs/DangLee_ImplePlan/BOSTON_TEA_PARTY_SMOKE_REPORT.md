# Puno / Boston Tea Party — manual smoke report

Ngày 2026-10-23. Nhánh `feat/remotion-animation-showcase`. Phạm vi đã được người dùng duyệt: [plan](../superpowers/plans/2026-10-23-boston-tea-party-smoke.md).

## Kết quả

**PASS lượt r2 theo yêu cầu mới của user: background fill tới viền16:9 bằng cover.** MP4 30giây/1080p30/900frame không audio đã render, kiểm ffprobe và phát hết30s không lỗi. [Mở clip local](http://127.0.0.1:3000/api/files/experiments/remotion-boston/2026-10-23-r2/boston.mp4). Kết quả/inventory cuối ở cuối báo cáo; r1 blocked giữ nguyên như bằng chứng lịch sử.

Inventory và điểm tiếp tục đã lưu trong [Boston smoke checkpoint](BOSTON_TEA_PARTY_SMOKE_CHECKPOINT.md). Chỉ yêu cầu resume mới của user mở lượt r2; triển khai dimension trước đó không tự resume.

## Lượt r2 — asset rời và cover16:9

- Run: `data/experiments/remotion-boston/2026-10-23-r2/`; series smoke giữ ID `33cec9f5-962f-4654-96ef-c4d347a8f687`.
- Import đúng bytes Puno approved và background ngang1376×768 từ seriesDIMENSIONS thành asset copy pending_review trong series smoke; agent xem/review/approve bản sao, không đổi file hoặc approval nguồn.
- Background dùng objectFit cover ở1920×1080: scale1.40625, hiển thị1935×1080, crop7.5px mỗi bên; không kéo giãn background, không đổi source PNG hoặc giả độ phân giải native.
- Chạy7base job còn thiếu (water,pier,ship,worker,crate,portal,splash) và1angry variant của worker qua original queue/worker. Tất cả succeeded attempt1, không feedback job thêm. Tính cả r1bg là9job ban đầu, đúng budget.
- Mười file được xem riêng, review provenance agent và approved trước snapshot; hai pose worker đều tay không. Bốn thùng là4instance của prop riêng, không baked trong actor/background.
- Lớp1 background xa tĩnh; lớp2 water/pier/ship tĩnh; lớp3 Puno,haiworker,bốncrate vàFX động, luôn phía trước midground. Horizon đo0.616; anchor chân và scale worker theo y/horizon; layout được agent xác nhận sau xem stills. Không dùng preset lab để vượt guard, không đổi DSL/production renderer.
- Timeline900frame: portal/Puno xuất hiện, Puno đi tới vị trí quan sát; hai công nhân luân phiên ném, impact390/510/630/750; splash cuối tắt trước778, cuối899không còn thùng. Không thoại/subtitle/audio. Whole-sprite motion, tiếp xúc tay/thùng chỉ ở mức gần đúng, không rig tay/chân.
- Snapshot asset/hash/review/catalog source và code+lockfile fingerprints nằm trong render-manifest.json. Trước approval worker_angry, lệnh xuất still thực đã bị gate chặn đúng. Frame0/105/260/345/410/525/645/765/899 đã render và xem các mốc chính; không đếm exit code là đủ kiểm chứng nghệ thuật.
- Fresh reviewer r2: không Critical/Important; đã đối chiếu layer/action/frame và hash10file+snapshot+sourcecode. Nhắc catalog-status là checkpoint cũ, cần refresh ở bước verification cuối.

## Lượt r1 — kết quả trước khi pause

| Bước | Kết quả và bằng chứng |
|---|---|
| Local preflight | Docker app healthy, worker và Supabase đang chạy; DB kết nối local thành công. Data dùng junction về thư mục dữ liệu gốc. |
| Router preflight | `GET /models` trả HTTP 200. Không đổi domain/IP hoặc model. |
| Asset generation | `asset.generate_base` qua queue gốc, worker thành công ở attempt 1 trong 22.322 giây. LLM writer `gemini-3-flash`; image model `ag/gemini-3.1-flash-image`. |
| File processing | Provider trả JPEG, pipeline gốc chuyển PNG bằng `toPng`; ảnh thực 1024×1024, kiểm bằng Sharp. |
| 16:9 gate | FAIL: `1024 × 9 !== 1024 × 16`. Request hiện chỉ gửi model/prompt; prompt 16:9 không bảo đảm kích thước output. Chưa xác định provider có hỗ trợ tham số aspect hay không trong cấu hình đang dùng. |
| Visual review | Agent đã xem ảnh: chỉ có trời, mây, cảnh bờ cảng xa và nước; không thấy nhân vật/thùng/bến/tàu tiền cảnh hoặc chữ. Horizon thực khoảng y=0.66, khác mốc 0.40 yêu cầu. Không duyệt ảnh vì sai tỷ lệ. |
| Approval/catalog | Asset và variant giữ `pending_review`, chưa được agent approve/reject hoặc đưa vào render. Kiểm tra ngăn pending_review khỏi catalog chưa chạy trong smoke này. |
| Asset còn lại / Puno import | Chưa chạy; không sinh thêm model/job. Puno nguồn giữ nguyên. |
| Composition / motion / MP4 | Chưa triển khai/chạy vì background prerequisite fail. Không có khẳng định đã kiểm chứng cảnh ném thùng hoặc output 30 giây. |
| Production scene/render jobs | Không gọi `scenes.generate` / `video.render`; không sửa DSL, handler hay schema. |

## Dữ liệu để truy vết

- Series: `33cec9f5-962f-4654-96ef-c4d347a8f687` — `SMOKE — Puno Boston Tea Party — 2026-10-23`.
- Asset: `69466165-cdfb-4d16-bcc1-8bc932123b8b`, tên `bg_boston_harbor_far`.
- Job: `bae606af-6da5-4cda-901d-20998e02cd51`, bắt đầu `2026-10-23T13:28:57.979Z`, xong `13:29:20.421Z`.
- File: `data/assets/69466165-cdfb-4d16-bcc1-8bc932123b8b/base.png`.
- SHA256: `3c7269d9125cf45df6ccdd20697d9531c563e8a32a702f933313486c380cba79`.
- Manifest: `data/experiments/remotion-boston/2026-10-23-r1/manifest.json`, trạng thái `blocked_background_ratio`.
- Một job ban đầu đã dùng, không có job feedback/retry bổ sung; worker chỉ có một attempt.

## Chạy và kiểm tra

`npx tsx --env-file=.env scripts/spikes/remotion-boston/run.ts background` tạo đúng một run mới; từ chối chạy lại nếu manifest đã tồn tại. `status` chỉ đọc DB/ảnh và cập nhật manifest, không gọi model. Chỉ cho phép database local. Không in env/key. Không dùng manifest mới để tự ý lặp lại generation.

Đã chạy manual smoke theo phạm vi duyệt; không tạo/chạy unit/e2e test, fixture hay mock. Không thay đổi package/lock/schema/production handler. Lint script đã chạy thành công; kiểm tra kiểu và review cuối được ghi trong ledger.

## Hướng xử lý tiếp

Cần background đúng 16:9 trước khi tiếp tục. Có thể dùng ảnh 16:9 được upload/duyệt trong catalog, hoặc triển khai option dimension theo [spec đã soạn](../superpowers/specs/2026-10-23-asset-generation-dimensions-design.md) sau khi được duyệt. Không tự thêm tham số vào hợp đồng 9router trong smoke này.

Nguồn API đã đối chiếu qua Context7: [Drizzle PostgreSQL insert](https://github.com/drizzle-team/drizzle-orm-docs/blob/main/src/content/docs/pg/insert.mdx); nguồn 9router/Remotion nằm trong plan. Runtime thực: Node 24.21.0 trên host; Docker Compose 5.5.1; repo Remotion 4.0.537, Sharp 0.35.5, Drizzle 0.45.4.

## Inventory cuối r2 — tất cả approved trong series smoke

| Key | Asset ID | State | PNG |
|---|---|---|---|
| background | `5c2ee1d3-2c93-419b-8ec2-bf567bfd5868` | base | 1376×768 |
| puno | `a268fbbc-4e8f-498d-807e-f32df4e0f2fa` | base | 682×849 |
| water | `911e9c30-5713-4642-a529-9b67845d93a5` | base | 1168×228 |
| pier | `aaa33d41-0b46-482e-b616-dca75ce294e2` | base | 1214×345 |
| ship | `9c41072c-044c-45d8-a543-bb558ac5ebb7` | base | 893×833 |
| worker | `0d5ec303-45f8-4f33-a622-2fbd5929fcec` | base | 588×958 |
| crate | `b83a7597-0f0d-4a14-9009-a9c649e98d03` | base | 888×848 |
| portal | `b0dda125-16c3-44fd-8852-52b90547adc3` | base | 674×836 |
| splash | `a12e266e-ee21-4a11-bb19-89f12a1f213b` | base | 635×606 |
| worker_angry | `0d5ec303-45f8-4f33-a622-2fbd5929fcec` | angry | 623×932 |

## Kết quả cuối r2

**PASS manual smoke theo phạm vi đã duyệt và amendment cover.** File `data/experiments/remotion-boston/2026-10-23-r2/boston.mp4`, H.2641920×1080,30fps,900frames,30.000000s,6322483bytes, không audio stream. Đã phát file MP4 thật qua app local tới30s/ended=true/error=null; xem ảnh trích từ video encoded ởframe345 và899. Foreground/asset separation và cuối cảnh không còn thùng được kiểm qua frame mẫu, video và source review.

SHA256 MP4: `f36c7ee87cbd0dcd13deef21a5123be00173401a46968fbac2fdd65716d03fc5`.

Lint repo, targeted tsc cho script/composition, tsc repo và git diff --check được ghi trong ledger. Fresh reviewer không có Critical/Important; catalog-status.json đã refresh thành10/10approved. Toàn bộ9job initial của smoke gồm r1bg+8jobr2 đều succeeded attempt1,0feedbackjobs,0activejobs. Hash10file checkpoint cũ giữ nguyên, background DIMENSIONS nguồn vẫn pending_review.

Giới hạn: chuyển động whole-sprite, tay/thùng gần đúng và chuyển pose có thể thấy rõ; chưa user duyệt nghệ thuật. Asset pipeline thật đã chạy, nhưng composition nội dung này là standalone smoke, không phải production scenes.generate/video.render E2E. Không tạo/rerun formal test files, không sửa schema/DSL/handler/renderer production để làm smoke, không commit/push.

Xác minh cuối sau đóng gói artifact: repo tsc, targeted tsc cho smoke, npm run lint và git diff --check đều exit0. Source archive lưu `.txt` để không bị compiler app quét như code runtime; bytes/hash của3source khi render vẫn nguyên. Runner live sau render chỉ đổi extension snapshot thành.txt cho các lượt sau, không đổi composition hoặc MP4. Nguồn CLI metadata: [FFmpeg ffprobe documentation](https://github.com/FFmpeg/FFmpeg/blob/master/doc/ffprobe.texi), runtime ffprobe9.0.1.
