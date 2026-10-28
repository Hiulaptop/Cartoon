# Animation hoàn toàn bằng Remotion — thiết kế đề xuất

Trạng thái: **APPROVED cho bước A — người dùng duyệt trong chat ngày 2026-10-23**. Ngày 2026-10-23.

## 1. Quyết định và giới hạn

Theo yêu cầu mới: toàn bộ animation dựng bằng Remotion; giữ pipeline gốc. Dừng hướng AnimatedDrawings, không tiếp tục build/smoke test đó. Không dùng Motion Canvas, ToonCrafter, LivePortrait hoặc Rhubarb.

Người dùng đã xác nhận: bản đầu dùng ảnh/state nguyên khối hiện có trước; rig tách bộ phận để sau.

Người dùng đề xuất cấu trúc cảnh ba lớp: background tĩnh phía sau horizon, midground tĩnh gồm bối cảnh và có thể có nhân vật phụ, foreground động gồm nhân vật chính và đạo cụ animation. Người dùng đã xác nhận foreground luôn ở trước midground trong bản đầu. Default horizon y=0.40 vẫn là đề xuất biên soạn trong bản thiết kế chờ duyệt.

Đề xuất của người biên soạn: làm showcase có thể xem và xuất MP4 trước, rồi mới thiết kế DSL v2/tích hợp scenes.generate. Người dùng đã duyệt spec/plan bước A để triển khai; bước B cần thiết kế và duyệt riêng.

Mục tiêu showcase: người dùng nhìn được chuyển động, căn chân/tỷ lệ, so sánh nhẹ/mạnh và quyết định phong cách. Không hứa tự tạo chu kỳ tay/chân giải phẫu từ một PNG. Biểu cảm là đổi state đã duyệt, không AI sinh frame trung gian. Có squash/stretch có chủ đích thì hình học ảnh sẽ thay đổi; không gọi đó là giữ nguyên nét vẽ 100%.

Không đổi DB, DSL v1, scenes.generate, luồng duyệt hoặc quy trình upload trong bước đầu. Không tự chạy model/tạo asset mới. Audio track, rig phân lớp, editor timeline tổng quát, tập phim 60 phút và visual judge bằng ảnh là phạm vi sau.

## 2. Repo và phiên bản đã xác minh

HEAD be0a1487e34d3447702aff4e69524656d946c4cd, có thay đổi local chưa commit. Graph .ua cùng HEAD nhưng chưa phản ánh toàn bộ file local; đã đọc source trực tiếp.

Package.json/lockfile: Next 15.5.28, React 19.1.0; remotion, @remotion/player, @remotion/renderer, @remotion/bundler đều 4.0.537; LangGraph 1.5.1, Sharp 0.35.5, Drizzle 0.45.4, Zod 4.6.7. Dockerfile worker Node 22-bookworm-slim. Không nâng phiên bản để làm animation.

@remotion/paths 4.0.537 có trong lockfile dưới dạng dependency gián tiếp, chưa khai báo trực tiếp trong package.json. @remotion/transitions và @remotion/noise chưa cài. Showcase không cần thêm package; SVG đơn giản dùng DOM SVG và phép tính thuần.

Hiện trạng:

- Scene DSL v1: 1920×1080, 30 fps, tối đa 30 giây/cảnh, tối đa 4 nhân vật.
- helpers.ts đã có positionAt, stateAt, cameraAt, fadeAt; chưa có pose chuyển động cơ thể.
- SceneView.tsx dùng ảnh theo chiều cao, neo tâm đáy ảnh; renderer/Player cùng dùng component này.
- VideoComposition.tsx nối cảnh bằng Sequence; thời lượng là tổng cảnh, fade nằm bên trong cảnh.
- scene-jobs.ts ghi dslVersion=1; scene/prompts.ts yêu cầu version=1 và y gần 0.9, height 0.5–0.7. Chưa được thay các mặc định này âm thầm.
- Judge hiện đọc JSON, không kiểm chứng khung hình thật.

## 3. Các API đã nghiên cứu và cách dùng

Nguồn dưới đây là tài liệu chính thức tại tag v4.0.537, tra qua Context7 trước và đối chiếu GitHub; không dựa vào API phiên bản khác.

### Thời gian và nội suy

- useCurrentFrame(): frame hiện tại, bắt đầu từ 0; trong Sequence là frame cục bộ. Lấy frame một lần ở showcase rồi truyền số frame xuống pure functions, tránh trừ offset hai lần.
- useVideoConfig(): fps, width, height từ composition, không dựa vào tốc độ phát của màn hình.
- interpolate(frame, inputRange, outputRange, options): vị trí, opacity, scale và camera; clamp hai đầu ở những animation hữu hạn để không extrapolate ngoài khoảng.
- Easing.linear: di chuyển đều; Easing.inOut(Easing.ease): tăng/giảm tốc; Easing.out(Easing.cubic): phản lực. Chọn easing theo preset, không cho model cung cấp code.
- spring({frame, fps, config, durationInFrames}): độ bật/settle cho recoil/pop. Overshoot là khả năng có chủ đích; giới hạn riêng những giá trị không được âm hoặc lật sprite. Spring không tự đưa nhân vật trở về pose gốc.
- measureSpring({fps, config, threshold}): đo thời gian settle nếu cần; durationInFrames của timeline vẫn là quyết định rõ ràng, không để đuôi spring làm đổi tổng clip ngoài ý muốn.
- random(seed): rung có thể tái hiện. Seed gồm preset version + actor ID + chỉ số mốc rung; không dùng Math.random(), random(null), Date.now(), setInterval hoặc requestAnimationFrame để tính pose.

### Timeline và hiển thị

- Sequence / Series: tổ chức shot và offset; giữ cách Sequence hiện có trong repo, không refactor pipeline vì tài liệu mới có API khác.
- Img + staticFile: ảnh sẵn, chờ tải trong render; giữ hai chế độ đường dẫn giống repo: URL /api/files cho Player, staticFile cho bundle.
- AbsoluteFill và React/CSS transform: nhóm camera, actor, props và overlay; tách từng nhóm để thứ tự transform rõ ràng.
- SVG path + strokeDasharray/strokeDashoffset: mũi tên/đường tiến quân đơn giản. Không coi SVG path helper là hàm sẵn của package remotion.
- Player: preview và scrub; renderMedia: xuất H.264; renderStill: xuất frame để người dùng soi bố cục. Dùng cùng component và cùng props snapshot.
- TransitionSeries thuộc package riêng @remotion/transitions, không cần ở bước này. Transition chồng shot sẽ làm giảm tổng thời lượng; giữ cut/fade hiện có, không thay bằng overlap âm thầm.

### Tài nguyên laptop

renderMedia.concurrency nhận số tiến trình song song hoặc phần trăm CPU threads; mặc định để Remotion tự chọn. Đề xuất showcase mặc định concurrency=1, cho phép CLI chọn số nguyên 1–4 và ghi vào manifest. Đây là mức song song, không là giới hạn CPU/RAM/VRAM cứng. Không hứa có thanh điều chỉnh phần trăm VRAM hoặc bắt buộc CUDA/ROCm. Giới hạn Docker/cgroup nếu cần sẽ được thiết kế riêng, không đổi global Docker Desktop trong bước này.

Không dùng OffthreadVideo, WebGL hay cache video vì showcase là ảnh/SVG. GPU AMD ở máy khác không là điều kiện để xem showcase trên laptop.

## 4. Kiến trúc bước A: showcase không ghi dữ liệu sản phẩm

Một component AnimationShowcase riêng, không đổi SceneView/Root/VideoComposition sản xuất. Đường vào Remotion riêng đăng ký composition AnimationShowcase, dùng phiên bản và browser/bundler hiện có.

### Ba lớp cảnh

Thứ tự vẽ đề xuất: background → midground → foreground → subtitle/UI. Layer quyết định trước/sau, còn tĩnh/động là thuộc tính diễn hoạt; không dùng hai khái niệm thay thế nhau.

- **Background tĩnh:** không gian xa phía sau horizon như trời, núi, đường chân trời, cảnh quan xa. Là ảnh nền/phần vẽ đã chuẩn bị sẵn; không tự có chuyển động nội tại.
- **Midground tĩnh:** mặt đất/sàn và bối cảnh như nhà, cây, xe đỗ, đám đông hoặc nhân vật phụ đứng yên. Có thể là plate đã vẽ hoặc các asset được ghép và đặt cố định. Nhân vật chính đứng trên mặt đất được mô tả ở lớp này nhưng sprite nhân vật vẫn ở foreground. Xe chạy hay người phụ diễn hoạt phải được khai báo trong nhóm động thay vì vừa gọi tĩnh vừa animate ngầm.
- **Foreground động:** nhân vật chính, đạo cụ được dùng trong hành động và các hiệu ứng animation. Asset được chuyển động/đổi state bằng preset Remotion. Đạo cụ foreground vẫn có thể đứng yên trong một đoạn; thuộc lớp này không bắt buộc phải chuyển động liên tục.

Tĩnh nghĩa là không thay vị trí/state trong không gian cảnh; camera chung vẫn có thể làm cả ba lớp đổi vị trí trên màn hình. Bản đầu không thêm parallax có tốc độ riêng cho từng lớp.

Horizon là mốc phối cảnh, không phải mask cắt cứng ảnh theo một hàng pixel. Nhà/cây ở midground có thể vươn lên trên horizon; không cắt ngọn cây/mái nhà. Mặt đất có thể bắt đầu gần horizon và kéo xuống đáy khung.

Quyết định đã được người dùng xác nhận cho bản đầu: foreground luôn nằm phía trước midground; renderer vẽ foreground sau midground để foreground phủ lên midground. Actor không đi ra sau cây/xe/nhà trong cùng shot. Trong foreground, sort theo ground foot khi cần; không sort xuyên lớp chỉ vì actor thay y. Occluder/depth-order động nằm ngoài phạm vi bản đầu.

Không tự tách một background PNG đã flatten thành sky/ground/tree có alpha. Để thấy ba lớp thực sự, cần background và midground plate/cutout phù hợp; asset chưa có phải được báo rõ. Cảnh nền nguyên khối hiện có vẫn xem được như chế độ tương thích, midground rỗng, nhưng không tuyên bố đã tách được bối cảnh.

Pure functions dự kiến:

- evaluateMotion(preset, frame, fps, intensity, seed): trả local pose {offsetX, offsetY, rotateDeg, scaleX, scaleY, opacity}; offset là phần chiều cao sprite, rotation theo độ, scale tương đối. Ngoài khoảng trả identity.
- evaluateGroundScale(foot, layout, relativeHeight): trả chiều cao theo khung hoặc lỗi bố cục; không clamp để che dữ liệu sai.
- evaluateCamera(frame, config): zoom/focus/offset rung xác định theo frame.

Preset đề xuất: idle_bob, walk_bob, run_bob, hop, recoil, squash, camera_shake. intensity giới hạn subtle/normal/strong; tham số số cụ thể thuộc preset version, không tự thay sau khi người dùng duyệt output.

Thứ tự transform: vị trí chân trên mặt đất → kích thước phối cảnh → offset/rotation/squash quanh chân → flip cục bộ → camera chung. Bóng đơn giản bám điểm chân trên đất, không bay theo hop; chiều sâu và y-sort dùng điểm chân ground, không dùng offset nhảy. Subtitle và UI debug nằm ngoài camera.

Một actor chỉ có một body preset đang hoạt động; camera effect độc lập. Khoảng thời gian [from,to), frame hữu hạn; không overlap body clip của cùng actor. Pose về identity ở ranh giới; hop phải có cất/đáp, recoil/squash phải có hồi phục. Bob chỉ chạy khi actor thực sự di chuyển, có envelope vào/ra để không giật.

State: chọn trong các variant đã duyệt hiện có; thiếu walk thì dùng base/idle và ghi rõ trong showcase. Thiếu một biểu cảm thì hiển thị thiếu state, không generate và không bịa ref. Quy tắc talk_a/talk_b của pipeline gốc giữ nguyên; trong showcase đổi biểu cảm chủ đích không bị auto-talk ghi đè, không phát narration giả.

## 5. Horizon và tỷ lệ

Kế thừa phần 5 của tài liệu thanhpahm-motioncanvas-parody.md, với các ràng buộc rõ cho showcase:

- Chỉ background đúng 16:9, không crop/cover làm lệch metadata. Thiếu nền phù hợp thì báo prerequisite, không tự sinh nền.
- Người dùng chỉnh horizonY, điểm referenceFoot và referenceHeight; đánh dấu standingRegions dạng polygon qua nhập tọa độ và overlay. V1 lab dùng input số/JSON gọn, không xây editor kéo thả polygon đầy đủ.
- Đề xuất default đường horizon: y=0.40 (432 px ở 1080p), đường ngang từ x=0 đến x=1. Hiện ngay trong editor trước khi căn chỉnh; người dùng có thể đổi/reset. Đây là default biên soạn, chưa phải horizon được nhận biết hoặc xác nhận đúng cho ảnh.
- Phân biệt giá trị có sẵn và đã xác nhận: layout mới ở trạng thái chưa xác nhận, chặn xuất ground_plane đến khi người dùng duyệt horizon/vùng đứng/reference. Cảnh flat vẫn có thể hiện đường tham chiếu mặc định trong editor nhưng không dùng nó để tính scale và không render đường vào video thường.
- Đường chân trời phối cảnh không đồng nghĩa đường biên trời/cây/nhà. Flat/top-down là chế độ riêng không áp scale theo horizon.
- heightAtFoot = referenceHeight × relativeHeight × (footY − horizonY) / (referenceFootY − horizonY).
- Kiểm tra điểm chân nằm trước horizon + epsilon, trong vùng đứng; hệ số tham chiếu dương/hữu hạn; kiểm tra đường đi ở các frame. Ghi vi phạm và chặn xuất showcase nếu layout không hợp lệ.
- Mặc định epsilon=0.03, relativeHeight=1; đây là giá trị khởi đầu do người biên soạn đề xuất, không phải tự nhận biết chính xác từ ảnh.
- Chỉ nền mặt phẳng đơn giản; nhiều sàn/dốc/foreground mask để sau.
- Đổi y trong demo thì height cập nhật theo frame; sprite hop không làm đổi depth scale vì foot ground không đổi.
- Anchor của mỗi state là tọa độ chuẩn hóa trong ảnh, mặc định (0.5,1). Cho phép chỉnh từng state nếu trim làm lệch đáy; áp dụng anchor thống nhất trong lab, không sửa DB hay asset gốc.
- Debug có horizon, polygon, điểm chân, bounding box và số height. Bật/tắt debug chỉ thay overlay, không thay tính pose hoặc camera.

## 6. Input, snapshot và showcase

Lab nội bộ mới tại /scenes/animation-lab: chọn series, một background variant và một nhân vật chính từ catalog đã duyệt; thêm tối đa 8 midground item tĩnh và 4 foreground prop. Item midground có thể là approved prop/cutout hoặc nhân vật phụ dùng một state cố định; plate cần có alpha phù hợp nếu phủ lên background. Không tự chọn asset thuộc series khác hoặc đổi quy ước asset kind trong DB. Thiếu asset phân lớp thì báo prerequisite/chế độ nền nguyên khối, không tự sinh/tách ảnh. Mũi tên SVG là primitive minh họa.

Input nội bộ lab: {presetVersion:1, seriesId, backgroundRef, characterRef, midgroundItems, foregroundProps, layout, anchorByState, intensity, debug}. Hai danh sách mới mặc định rỗng; item có id duy nhất, approved ref/state, x/y/height và anchor; foreground prop thêm preset clip có giới hạn như body clip. Dùng x/y/height như vị trí và kích thước đã căn, không áp công thức tỷ lệ người cho nhà/cây/xe. Validate phía server trước resolve file; chỉ cho enum/giá trị số hữu hạn và path qua dataPath. Đây là hợp đồng mới của lab cần duyệt cùng spec này, không đưa vào Scene DSL v1.

Layout có discriminant flat/ground_plane; ground_plane chứa horizonY, epsilon, standingRegions (1–4 polygon đơn, 3–16 đỉnh, tọa độ 0–1, không tự cắt), referenceFoot, referenceHeight, nearFoot và farFoot để minh họa shot cuối. Flat chứa referenceFoot/referenceHeight để căn bố cục nhưng không có horizon/scale tham chiếu phối cảnh. Không gán horizon nếu mode flat.

Chuyển động ngang dùng referenceFoot.x ± 0.12 và cùng referenceFoot.y; shot chiều sâu nối farFoot → nearFoot. Lab kiểm tra toàn đường và biên sprite; sai thì yêu cầu chỉnh reference/near/far hoặc vùng đứng, không tự dời polygon. Layout mới mặc định flat, editor có đường horizon tham chiếu y=0.40; ground_plane chỉ bật sau khi người dùng nhập/xác nhận metadata. Draft ghi trạng thái xác nhận và mọi giá trị thực dùng, có presetVersion nhưng chưa lưu vào DSL/DB. CLI vẫn kiểm tra lại dữ liệu, không coi cờ xác nhận do client gửi là validation hợp lệ.

Lab preview chỉ giữ draft trong trang, không lưu DB. Cho phép tải JSON draft để dùng lại khi render; JSON gồm ref/config và assetFingerprints (map approved ref/state → SHA256 bytes do resolver server cung cấp), không chứa secret hoặc đường dẫn tuyệt đối tùy ý. CLI nhận draft path, resolve lại catalog theo series, kiểm tra approved và so fingerprint trước khi tạo snapshot asset. Draft thiếu fingerprint phải resolve/xem lại trên lab trước export; không coi hash do client gửi là quyền đọc file.

Snapshot output dưới data/experiments/remotion-animation/<run-id>/ gồm config đã resolve, SHA256 ảnh thực dùng, presetVersion, Remotion version, fps/resolution/concurrency và asset bytes copy vào publicDir riêng. Nếu approved asset đổi sau preview, so fingerprint và báo cần xem lại trước xuất; không tuyên bố hai bản giống nhau khi nguồn đã đổi.

Timeline đề xuất 600 frame = 20 giây ở 30 fps:

1. 0–119: idle nhẹ và đổi expression đã có.
2. 120–239: di chuyển ngang, walk_bob rồi run_bob.
3. 240–359: hop, recoil và squash theo các đoạn không chồng nhau.
4. 360–479: camera zoom/pan/rung ngắn, mũi tên SVG vẽ dần; giữ caption ngoài camera.
5. 480–599: so vị trí xa/gần và height theo horizon; flat thì minh họa bố cục phẳng và ghi rõ scale không theo horizon.

Mỗi shot bắt đầu từ pose đã xác định và hard cut có chủ đích; không ngầm nối vận tốc qua shot. Mỗi motion segment dùng frame cục bộ, không ảnh hưởng tổng 600 frame. Xuất MP4 1920×1080/30fps; có thể xuất thêm frame tham chiếu bằng renderStill. Chưa có audio, cần ghi rõ clip im lặng.

## 7. Bước B: tích hợp production sau khi duyệt chuyển động

Chưa triển khai hoặc mặc định được duyệt trong bước A. Phải có spec/plan riêng trước khi:

- Thêm animation timeline, presetVersion, ground metadata/anchor vào DSL v2.
- Chọn nơi lưu metadata background và revision; không tự thêm cột DB lúc làm showcase.
- Parser đọc cả v1/v2, giữ v1 không đổi; scenes.dslVersion phải khớp JSON.version, không còn hardcode 1 khi ghi v2.
- Cập nhật prompts, deterministic checks, judge rubric, checkpoint/resume và mọi nơi đọc DSL trong Player/storyboard/render.
- Cho người dùng sửa/duyệt layout và chuyển động trong Cartoon, invalidation khi asset/layout đổi.
- Ngừng dùng mặc định prompt y~0.9/height 0.5–0.7 cho scene có ground metadata.

Bước B cần đảm bảo không đổi hình ảnh cảnh đã duyệt v1 hoặc resume checkpoint cũ bằng contract mới ngoài ý muốn. Không cố nhét field mới vào strictObject v1 rồi bỏ validation.

## 8. Kiểm chứng và tiêu chí bàn giao

Lần này chỉ viết tài liệu. Khi được duyệt triển khai A: lint, typecheck, build; không tự viết/chạy *.test.*/*.spec.* hoặc bộ test mới. Nếu người dùng muốn smoke test chính thức cho Remotion, cần phạm vi test và lệnh chạy được duyệt riêng theo AGENTS.md; duyệt smoke AnimatedDrawings trước đây không chuyển sang thư viện này.

Bàn giao A là lab preview, preset library nội bộ, công cụ xuất showcase và MP4 để người dùng đánh giá khi việc xuất được yêu cầu/duyệt. Tiêu chí sản phẩm: seek đến frame bất kỳ ra đúng pose; chân/depth không trôi ngoài chủ đích; expression không giật anchor; tất cả shot đủ 600 frame; preview/export cùng snapshot; pipeline sản xuất vẫn v1. Không tuyên bố chất lượng đạt trước khi người dùng xem.

## 9. Tài liệu chính thức

- [useCurrentFrame](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/use-current-frame.mdx), [useVideoConfig](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/use-video-config.mdx).
- [interpolate](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/interpolate.mdx), [Easing](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/easing.mdx).
- [spring](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/spring.mdx), [measureSpring](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/measure-spring.mdx), [random](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/random.mdx).
- [Sequence](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/sequence.mdx), [TransitionSeries: overlap](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/transitions/transitionseries.mdx).
- [renderMedia và concurrency](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/renderer/render-media.mdx).

Preset, giới hạn lab, horizon và cách chia giai đoạn là thiết kế đề xuất của Cartoon; không phải tính năng built-in chỉ cần bật một option của Remotion.

