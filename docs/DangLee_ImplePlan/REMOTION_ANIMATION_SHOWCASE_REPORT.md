# Remotion Animation Showcase — bàn giao bước A

Ngày: 2026-10-23. Nhánh: `feat/remotion-animation-showcase`.

## Kết quả

Đã triển khai code lab, preset/evaluator, validation và CLI xuất showcase. Lab đang chạy local tại `http://127.0.0.1:3001/scenes/animation-lab` từ production build của worktree.

**Chưa có video/frame bàn giao:** catalog local chỉ có một background approved 1024×1024. Theo spec, chỉ nhận background 16:9 và không tự crop/resize hoặc bypass approval. Luồng render thành công và chất lượng hình ảnh chưa được xác minh bằng output thực tế. Cần background 16:9 đã duyệt trong catalog để tiếp tục.

## Phần đã có

- Preset version 1: idle/walk/run bob, hop, recoil, squash và camera shake có seed.
- Showcase 600 frame, 1920×1080/30fps, 5 shot, im lặng; entry và component riêng.
- Ba lớp cố định: background tĩnh → midground tĩnh → foreground động, caption/debug nằm ngoài camera.
- Midground tối đa 8 item, foreground một nhân vật chính và 4 prop, source approved catalog theo series.
- Layout flat/ground, horizon default 0.40, standing polygons, reference/near/far foot, anchor từng state và cờ xác nhận trước export ground.
- Kiểm tra schema/polygon, path chân ở từng frame, scale và safe area sau camera projection.
- Preview ảnh snapshot theo SHA256; draft chứa fingerprint; CLI kiểm approved/hash lại rồi đóng gói asset bytes, config, manifest, concurrency và output riêng theo run-id.
- CLI hỗ trợ concurrency 1–4 và frame tham chiếu tùy chọn; không nối vào queue handlers.

Chi tiết sử dụng và preset parameters: [REMOTION_ANIMATION_LAB.md](REMOTION_ANIMATION_LAB.md).

## Kiểm chứng đã thực hiện

- `npm ci`: thành công, giữ package.json/lockfile.
- `npm run lint`: exit 0 sau lần sửa cuối.
- `npx tsc --noEmit`: exit 0 sau lần sửa cuối.
- `npm run build`: exit 0 sau lần sửa cuối; route animation-lab nằm trong bảng route build.
- CLI `--help`: exit 0, không đọc DB hoặc render.
- Mở lab bằng trình duyệt: đọc catalog local được, hiện đúng ba lớp/control và prerequisite thiếu nền 16:9.
- Bấm preview với nền hiện có: hiện thông báo `Nền 1024×1024 chưa đúng 16:9...`, không phát sinh lỗi React/server component; browser console trống ở lần quan sát cuối.
- So hash 13 file nền tảng với workspace gốc: không khác biệt, gồm production DSL/renderer/jobs/handlers và package/Docker files.
- `git diff --check`: sạch whitespace cho tracked diff.
- Không tạo/chạy *.test.* hoặc *.spec.*, không test suite. Các quan sát UI trên là thao tác vận hành trên tính năng được yêu cầu.

Log kiểm chứng nằm trong `.superpowers/sdd/2026-10-23-remotion-animation/` của worktree, không commit.

## Review và sửa

Reviewer độc lập nêu hai Important issue và một Minor issue; đã sửa:

1. Tailwind Preflight `img max-width:100%` xung đột wrapper sprite có kích thước layout 0: ảnh sprite đặt inline maxWidth/maxHeight none để preview không bị co ảnh, nhất quán bundle standalone.
2. Bounds trước đây chỉ kiểm world-space: nay project cùng camera với debug/renderer trước kiểm safe area; kiểm ground foot vẫn ở world-space.
3. Shot cuối ở flat đổi caption thành bố cục phẳng/scale cố định, kể cả khi debug tắt.

Khi mở route thực tế đã phát hiện Remotion package root cần React.createContext trong RSC. Đã tách full-pose validator khỏi server resolver: server kiểm schema/catalog/hash; Player client và Node CLI dùng chung full-pose validator, CLI chặn lỗi trước render. Không dùng private API của Remotion.

Midground kiểm có pixel trong suốt thực tế bằng Sharp stats, không chỉ suy luận từ kênh alpha; ảnh EXIF chưa chuẩn hóa hướng bị từ chối để giữ kích thước/anchor nhất quán.

## Những gì không thay đổi

Không schema/migration/DB write, không đổi trạng thái asset/approval, không gọi model, không sửa production DSL v1, SceneView/VideoComposition hoặc queue handler. Các thay đổi Docker/Supabase baseline có sẵn được sao chép sang worktree và bảo toàn. Không commit/push.

## Tiếp theo

1. Cung cấp/duyệt background 16:9 qua quy trình asset của project.
2. Mở lab, chọn asset, căn horizon/vùng đứng/anchor và preview; tải draft có fingerprint.
3. Dùng CLI theo README để xuất showcase/frames, rồi người dùng đánh giá chuyển động. Không gọi code/render đạt chất lượng nghệ thuật trước khi có output.
4. DSL v2/tích hợp scenes.generate là bước B chưa triển khai.

Nguồn đối chiếu: [Remotion v4.0.537](https://github.com/remotion-dev/remotion/tree/v4.0.537), [Tailwind Preflight](https://tailwindcss.com/docs/preflight#images-are-constrained), [Sharp metadata/stats](https://sharp.pixelplumbing.com/api-input/).
