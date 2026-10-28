---
name: thanhpahm-remotion-parody
description: Hoạt hình lịch sử và hài hình thể trên pipeline Cartoon gốc, animation hoàn toàn bằng Remotion và định nghĩa bố cục theo horizon.
status: draft-for-review
updated: 2026-10-23
---

# Hoạt hình lịch sử và hài hình thể trên pipeline Cartoon

Tài liệu thiết kế và phạm vi thử nghiệm, không phải AGENTS.md/SKILL.md có hiệu lực hoặc bằng chứng tính năng đã triển khai. Giữ tên file cũ để các liên kết tiếp tục hoạt động.

## 1. Quyết định và phạm vi

Theo yêu cầu của người dùng:

- Giữ Remotion, pipeline gốc, cùng project và DBMS hiện có.
- Bỏ ToonCrafter khỏi kiến trúc và dependency.
- Toàn bộ animation dùng Remotion theo yêu cầu mới; dừng hướng AnimatedDrawings.
- Bản đầu dùng ảnh/state hiện có theo xác nhận của người dùng; rig tách bộ phận để sau.
- Rhubarb và đồng bộ khẩu hình theo âm vị nằm ngoài phạm vi; biểu cảm/state do bộ asset cung cấp.
- Bổ sung horizon, vùng được đứng và tỷ lệ nhân vật theo vị trí trong background.

Đề xuất của người biên soạn, chưa phải quyết định đã được người dùng duyệt:

- Không thêm Motion Canvas, LivePortrait hoặc proxy nén ngữ cảnh trong đợt này.
- Dùng preset chuyển động Remotion để diễn hoạt ảnh/state đã có.
- Người dùng xác nhận metadata bố cục; AI chỉ gợi ý, không tự quyết horizon/vùng đứng.
- Giữ JSON có schema/validation; không cho LLM sinh TypeScript tùy ý rồi thực thi trong worker.

Cập nhật tài liệu không đồng nghĩa duyệt migration, DSL mới, hợp đồng client/server/9router hoặc bắt đầu triển khai tính năng.

## 2. Mốc hiện tại đã đối chiếu với code

Đối chiếu ngày 2026-10-23, HEAD `be0a1487e34d3447702aff4e69524656d946c4cd`, có thay đổi local chưa commit. Phiên bản thực tế từ package.json/lockfile: Next.js 15.5.28, React 19.1.0, Remotion 4.0.537, LangGraph 1.5.1, Drizzle ORM 0.45.4, Sharp 0.35.5, Zod 4.6.7. Dockerfile dùng worker Node 22 trên Debian bookworm và app Node 22 trên Alpine.

Ưu tiên laptop Windows, RTX 3050 Ti 4 GB VRAM, RAM 16 GB; PC AMD xác minh sau.

Các điểm neo:

- `src/lib/scene/schema.ts`: DSL v1, 1920×1080, 30 fps, tối đa 30 giây/cảnh.
- `src/lib/script/schema.ts`: mục tiêu kịch bản 30–600 giây; chưa thiết kế tập 60 phút.
- `src/lib/scene/catalog.ts`: asset/variant đã duyệt, gồm path và kích thước ảnh.
- `src/worker/scene-graph.ts`: writer → kiểm tra deterministic → judge → sửa có giới hạn.
- `src/lib/judge/prompts.ts`: judge đọc kế hoạch và JSON, chưa nhìn frame render.
- `src/remotion/SceneView.tsx`, `helpers.ts`: ảnh nguyên khối, state, di chuyển, zoom/focus, cut/fade; talk_a/talk_b là tráo state đơn giản.
- `src/remotion/VideoComposition.tsx`, `src/worker/render-jobs.ts`: nối cảnh đã duyệt và xuất H.264 MP4; composition hiện chưa có audio track.

Các khả năng dự kiến dưới đây chưa phải tính năng đang có.

## 3. Quy trình giữ nguyên

1. Chuẩn bị asset trong series và duyệt variant. Nguồn là pipeline tạo asset gốc hoặc designer; luồng nhập asset designer cần thiết kế riêng nếu UI hiện tại chưa hỗ trợ.
2. Tạo/duyệt kịch bản bằng pipeline gốc, giữ hook/setup/escalation/punchline/callback.
3. Sinh kế hoạch và JSON cảnh, kiểm tra asset, thời gian, thoại, judge như hiện tại.
4. Phần mở rộng dự kiến: bố trí theo metadata background đã duyệt, kiểm tra điểm chân và tỷ lệ trước khi duyệt cảnh.
5. Preview và duyệt storyboard trong Cartoon.
6. Remotion render, duyệt bản render, tiếp tục quy trình upload hiện có.

Audio có sẵn, narration, BGM/SFX là hướng mở rộng phù hợp nhưng cần spec riêng về track, offset, cắt ghép và thời lượng. Thay biểu cảm asset không tự đồng bộ với âm thanh; chưa cần nhận dạng âm vị.

Định hướng sáng tạo: hài tình huống lịch sử, hiện đại hóa bối cảnh, hard cut biểu cảm, callback; mảng miếng nguyên bản, không sao chép câu đùa/khung hình. Squash/stretch, rung camera, mũi tên bản đồ chỉ được thực thi sau khi có primitive/DSL được duyệt.

## 4. Router và catalog

- Dùng `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY`, `LLM_WRITER_MODEL`, `LLM_JUDGE_MODEL`, `IMAGE_MODEL` của pipeline gốc.
- Endpoint worker được xác minh trong phiên trước: `https://router.studev.net/v1`; đọc lại cấu hình thực tế khi triển khai, không hardcode URL/model ID vào tính năng mới.
- Không đổi sang localhost:20128, không thêm Headroom/localhost:8787 hoặc cam kết giảm token.
- Catalog DB đã duyệt là nguồn chính. Nếu xuất manifest thì sinh từ catalog, không tạo nguồn dữ liệu sửa tay song song.
- Không ghi API key vào tài liệu/report/log.

## 5. Định nghĩa khung cảnh và phối cảnh

### 5.0. Ba lớp bối cảnh theo đề xuất của người dùng

- Background tĩnh: không gian xa phía sau horizon, như trời/núi/đường chân trời.
- Midground tĩnh: mặt đất, nhà, cây, xe đỗ và nhân vật phụ đứng yên; có thể là plate hoặc asset ghép.
- Foreground động: nhân vật chính, đạo cụ và hiệu ứng dùng trong animation.

Layer quyết định thứ tự trước/sau, tĩnh/động quyết định diễn hoạt. Camera chung vẫn tác động lên cả ba lớp. Không cắt cứng ảnh theo horizon, vì nhà/cây có thể vươn cao qua đường này. Không tự suy ra layer có alpha từ PNG đã flatten.

Người dùng đã chốt bản đầu foreground luôn ở trước midground; nhân vật không đi ra sau cây/xe/nhà trong cùng shot. Thứ tự vẽ là background → midground → foreground; không đổi lớp tự động theo tọa độ y. Chi tiết và giới hạn nằm trong spec Remotion, không sửa DSL v1 ở lượt này.

### 5.1. Hệ tọa độ và anchor chân

Tọa độ chuẩn hóa trong khung 16:9 trước biến đổi camera: trái trên `(0, 0)`, phải dưới `(1, 1)`.

- `(x, y)` là tâm điểm tiếp xúc chân với mặt đất, không là tâm ảnh.
- `height` là chiều cao hiển thị chia chiều cao khung; 0.30 tương ứng 324 px ở 1080p.
- Giữ aspect ratio asset; không kéo rộng nhân vật để ép vừa bố cục.
- Renderer hiện neo tâm đáy bounding box. Ảnh có bóng, lề trong suốt hoặc tư thế nhảy cần anchor chân riêng; đáy ảnh không luôn là đế chân.
- Các expression/state cần chung quy ước canvas, anchor và tỷ lệ để đổi biểu cảm không làm nhân vật giật vị trí/kích thước. Chưa giả định các variant đã trim hiện có đáp ứng điều này.

### 5.2. Horizon của background

Horizon là đường tầm mắt/đường chân trời phối cảnh của mặt đất. Không mặc định là ranh giới trời với cây, núi, nhà hoặc nằm giữa ảnh.

Đề xuất V1 cho mặt đất phẳng: `horizonY` là đường ngang được người dùng đánh dấu và duyệt trên preview của đúng background variant. AI có thể gợi ý nhưng người dùng được chỉnh trước khi sử dụng.

Theo yêu cầu phải có default, đề xuất horizonY=0.40 (432 px ở 1080p) chạy ngang toàn khung, cho chỉnh/reset trong editor. Default là mốc khởi đầu, cần người dùng xác nhận cùng vùng đứng/tỷ lệ trước xuất ground_plane. Với cảnh flat, chỉ là đường tham chiếu editor và không dùng để tính scale.

Các tên sau là thuật ngữ thiết kế, chưa phải cột DB/trường DSL được duyệt:

- `perspectiveMode`: `ground_plane` hoặc `flat`.
- `horizonY`: tọa độ y của horizon, chỉ bắt buộc ở ground_plane.
- `standingRegions`: các polygon được phép đặt chân.
- `referenceFoot`: điểm chân của nhân vật chuẩn đã cân bằng mắt.
- `referenceHeight`: chiều cao chuẩn theo khung tại referenceFoot.
- `relativeHeight`: hệ số chiều cao từng nhân vật so với nhân vật chuẩn.

Không suy ra toàn bộ vùng dưới đường trời là đất. Cảnh dốc lớn, cầu thang, nhiều sàn, horizon nghiêng hoặc phối cảnh bất thường cần căn tay hoặc thiết kế nhiều mặt phẳng ở giai đoạn sau.

### 5.3. Trước horizon thì được đứng ở đâu?

Vì y tăng xuống dưới, chân gần người xem thỏa `footY > horizonY + epsilon`. Đề xuất epsilon ban đầu 0.03 chiều cao khung, có thể hiệu chỉnh theo background.

Điều kiện này là cần nhưng chưa đủ: chân còn phải nằm trong standingRegions đã duyệt; loại hồ nước, khoảng trống, vật cản và nơi không có sàn. Duyệt cả bàn chân/thân và che khuất; một điểm nằm trong polygon không bảo đảm cả sprite không va đạo cụ.

- Không đặt nhân vật đứng trên trời/sau horizon để lấp chỗ trống.
- Ưu tiên nền có vùng đặt chân rộng, rõ và ít vật cản ở V1.
- Kiểm tra toàn đường di chuyển, không chỉ hai đầu; đường đi có thể xuyên vùng cấm dù hai đầu hợp lệ.
- Cùng mặt đất và cùng lớp: chân thấp hơn được vẽ phía trước. Cây/tường che người cần foreground layer/mask hoặc chỉnh tay; y-sort hiện tại không giải quyết mọi che khuất.

### 5.4. Scale theo vị trí

Đề xuất mô hình mặt đất phẳng, camera cố định; không phải khôi phục 3D tự động từ ảnh:

```text
d = footY - horizonY
dRef = referenceFootY - horizonY
heightAtFoot = referenceHeight × relativeHeight × d / dRef
```

Yêu cầu `dRef > epsilon`, dữ liệu hữu hạn/dương. Tại cùng độ sâu, relativeHeight thể hiện khác biệt người lớn/trẻ em hoặc cao/thấp; không ép mọi người cùng chiều cao.

Ví dụ minh họa, không là preset chung: horizonY=0.40; referenceFoot=(0.50,0.85); referenceHeight=0.36; relativeHeight=1.

- Chân y=0.65 → height=0.20 → 216 px ở 1080p.
- Chân y=0.85 → height=0.36 → khoảng 389 px.
- Chân y=0.95 → height=0.44 → khoảng 475 px.

x quyết định vùng đứng hợp lệ; y quyết định scale trong giả định một mặt đất. Designer phải cân referenceHeight theo cửa, bàn hoặc người mẫu trong ảnh: chỉ biết horizon chưa đủ để biết nhân vật phải lớn bao nhiêu.

Kiểm tra dự kiến:

- Cảnh toàn thân: đầu, chân và biên ngang nằm trong safe area; cận cảnh/cắt thân là lựa chọn có chủ đích.
- Scale vượt giới hạn DSL hiện tại (`height` 0.1–1.2) hoặc không vừa bố cục: báo để đổi vị trí/cảnh, không âm thầm clamp hoặc sửa schema.
- Đi theo y cần cập nhật height từng frame. DSL v1 chỉ có height cố định và moves x/y: trước khi có mở rộng được duyệt, chỉ dùng bố trí tĩnh/di chuyển ngang cùng độ sâu cho quy tắc này.
- Zoom/focus áp dụng sau bố cục, cùng biến đổi background và sprite; không nhân zoom hai lần vào heightAtFoot.
- Horizon/vùng đứng phải theo cùng phép crop/cover background. Renderer hiện dùng objectFit cover; metadata ảnh nguồn cần biến đổi tương ứng hoặc giới hạn thử nghiệm đầu ở nền đúng 16:9, không crop.

### 5.5. Cảnh không dùng horizon

Bản đồ nhìn từ trên xuống, đồ họa phẳng và nội thất không có phối cảnh xác định dùng `flat`: đặt vị trí/tỷ lệ theo bố cục duyệt, không áp công thức ground_plane. Quân đội trên bản đồ có tỷ lệ ký hiệu, không phải kích thước người trong không gian.

Metadata gắn đúng background variant/version. Đổi ảnh/crop phải duyệt lại căn chỉnh. Nơi lưu DB/JSON và UI thao tác cần spec triển khai riêng, chưa tạo migration trong lần sửa tài liệu này.

## 6. Hướng animation hiện hành: hoàn toàn bằng Remotion

Yêu cầu mới thay thế phạm vi thử AnimatedDrawings trước đó. Không tiếp tục build/smoke test hoặc tích hợp công cụ đó. Giữ log/report cũ làm lịch sử, không xóa artifact và không đổi kết quả build lỗi thành thành công.

- [Spec và nghiên cứu API Remotion 4.0.537](../superpowers/specs/2026-10-23-remotion-animation-design.md).
- [Plan bước A: showcase 20 giây trước khi tích hợp DSL](../superpowers/plans/2026-10-23-remotion-animation.md).
- [Report AnimatedDrawings lịch sử, đã dừng hướng này](ANIMATED_DRAWINGS_SMOKE_REPORT.md).

Đề xuất thứ tự: duyệt thiết kế → dựng lab/showcase Remotion bằng ảnh/state → xem chuyển động và phối cảnh → thiết kế DSL v2/tích hợp pipeline sau. Chưa đổi schema, database hoặc code sản phẩm trong lượt lập plan.

Horizon/vùng đứng/scale ở phần 5 được giữ lại; spec mới làm rõ cách preview và snapshot. Đây vẫn là đề xuất chưa triển khai, không phải tính năng đã có trong Remotion/Cartoon.
