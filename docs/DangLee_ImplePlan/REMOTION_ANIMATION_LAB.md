# Animation Lab — Remotion 4.0.537

Nhánh `feat/remotion-animation-showcase`, bước A của [plan đã duyệt](../superpowers/plans/2026-10-23-remotion-animation.md). Lab dùng asset đã duyệt, không lưu scene/render/job vào database và không gọi model. Pipeline v1 hiện tại giữ nguyên.

## Mở lab

Tại worktree, dùng cấu hình `.env` local hiện có và DATA_DIR trỏ tới kho asset local. Không in hoặc đưa khóa DB/router vào JSON draft.

```powershell
npm run dev -- -p 3001
```

Mở `http://127.0.0.1:3001/scenes/animation-lab`. Chọn series, nền 16:9 và nhân vật đã duyệt. Nền vuông bị chặn, không crop/resize tự động. Lab vẫn mở được để xem prerequisite dù chưa có nền phù hợp.

## Ba lớp và bố cục

- Background là ảnh 16:9. Nếu đang dùng nền gộp sẵn, để midground trống; lab báo rõ chưa tách lớp.
- Midground gồm tối đa 8 cutout prop/nhân vật phụ tĩnh, có alpha; thứ tự trong danh sách quyết định trước/sau bên trong lớp.
- Foreground gồm nhân vật chính và tối đa 4 prop động, luôn phía trước midground. Bên trong foreground sort theo chân trên đất, rồi ID khi bằng nhau.
- Chọn asset ở dropdown rồi thêm vào layer; chỉnh vị trí/height/anchor trong JSON. Prop có thể nhận `clips`, ví dụ `[{"kind":"hop","from":240,"to":280}]`; không overlap clip của cùng prop. Walk/run bob của prop chưa có đường đi nên không được dùng.
- State nhân vật lấy từ catalog. Thiếu walk/happy/surprised được báo rõ, không tự tạo ảnh. Bộ nguồn hiện tại chỉ có base thì showcase giữ base.

Default layout là flat; đường horizon 0.40 chỉ tham chiếu. Chọn reset ground để có mẫu horizon/polygon/reference/near/far, sau đó sửa theo background. Các tọa độ tính theo toàn khung trước camera. Đặt `confirmed` thành true chỉ sau khi đã xem và xác nhận bố cục; CLI vẫn validate vùng đứng/đường đi/biên ảnh, không chỉ tin cờ này.

Height theo ground = referenceHeight × khoảng cách chân đến horizon / khoảng cách referenceFoot đến horizon. Hop chỉ nhấc sprite, không đổi điểm chân ground để tính scale/sort. Anchor theo state mặc định x=0.5/y=1; có thể sửa khi asset đã trim không cùng điểm chân.

Đổi bất kỳ draft control nào sẽ bỏ preview cũ, cần kiểm tra lại trước tải draft. Preview dùng ảnh snapshot đặt tên theo SHA256. Bật debug để thấy chân, outline, vùng đứng và horizon; tắt debug rồi preview lại để lấy draft sạch overlay cho video.

## Preset version 1

20 giây / 600 frame / 30 fps, năm shot hard cut. Các evaluator thuần frame; không phụ thuộc thứ tự render hoặc playback.

- idle_bob: thay scaleY tối đa 0.012 × intensity bằng sin và envelope.
- walk_bob/run_bob: nhấc thân tối đa 0.025/0.055 chiều cao sprite, nghiêng tối đa 2/5 độ; chỉ chạy cùng đường đi ngang.
- hop: nhấc tối đa 0.28 chiều cao sprite, cất/đáp về identity.
- recoil: spring stiffness=150, damping=12, x phản lực tối đa 0.12 chiều cao sprite và xoay 12 độ, envelope về identity.
- squash: scaleX thêm tối đa 0.28, scaleY giảm tối đa 0.22, envelope về identity.
- camera_shake: seed cố định theo frame, biên độ tối đa 12 px, zoom/focus trong shot camera.

Intensity subtle/normal/strong tương ứng 0.5/1/1.5. Đây là chuyển động cutout từ ảnh, không rig hoặc sinh chu kỳ khớp tay chân. Không có audio.

## Xuất showcase

Sau khi preview hợp lệ, tải draft đã resolve và đặt vào DATA_DIR, ví dụ `experiments/remotion-animation/draft.json`. Draft có fingerprint cho mọi asset. CLI resolve lại catalog và kiểm tra hash, thiếu/đổi asset thì yêu cầu preview lại.

Chạy host bằng env local:

```powershell
npx tsx --env-file=.env src/worker/render-animation-showcase.ts --draft experiments/remotion-animation/draft.json --concurrency 1
```

Hoặc trong worker container đã có source mới (phải build image worker từ worktree này trước), không cần `.env` trong container:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml exec -T worker node_modules/.bin/tsx src/worker/render-animation-showcase.ts --draft experiments/remotion-animation/draft.json --concurrency 1
```

Thêm `--stills 0,300,599` khi cần frame tham chiếu. CLI mặc định concurrency=1, nhận số nguyên 1–4; đây là song song CPU render, không phải quota RAM/VRAM. Không dùng approval smoke AnimatedDrawings để chạy test cho lab này.

Mỗi lần xuất tạo run-id mới dưới DATA_DIR/experiments/remotion-animation với public asset snapshot, manifest và `showcase.mp4`. Khi lỗi, manifest ghi failed và file partial không được báo thành công. Không commit output/runtime data. Giữ cùng draft debug/intensity/anchor khi so preview với export.

## Tình trạng asset lúc bàn giao

Kho local được đọc có nền `bg_boston_tea_party_dock.base` 1024×1024, hai nhân vật và một đạo cụ đã duyệt. Chưa có background đúng 16:9 để tạo output hợp lệ theo spec. Không tự đổi status/metadata/ảnh trong DB để tạo clip.

Nguồn API: [Remotion interpolate](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/interpolate.mdx), [spring](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/spring.mdx), [renderMedia](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/renderer/render-media.mdx). Các giới hạn lab là thiết kế của Cartoon.
