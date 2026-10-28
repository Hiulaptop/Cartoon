# Remotion Animation Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not start before explicit user approval of the spec and this plan. Steps use checkbox syntax. AGENTS.md overrides skill defaults about tests and commits.

**Goal:** Dựng lab và showcase animation 20 giây hoàn toàn bằng Remotion, dùng asset đã duyệt để người dùng chốt phong cách trước tích hợp DSL.

**Architecture:** Pure motion/ground/camera evaluators dùng chung cho Player và export. Showcase có entry/composition riêng; không thay SceneView, DSL v1 hoặc job pipeline gốc. Input lab được validate/resolve catalog phía server; dữ liệu draft không ghi DB.

**Tech Stack:** React 19.1.0, Next 15.5.28, Remotion/player/renderer/bundler 4.0.537, Zod 4.6.7, Docker worker Node 22 Debian. Không thêm dependency.

**Spec:** [2026-10-23-remotion-animation-design.md](../specs/2026-10-23-remotion-animation-design.md).

**Status:** APPROVED — người dùng duyệt spec/plan và yêu cầu triển khai trên nhánh feat mới ngày 2026-10-23. Phạm vi đề xuất là bước A; bước B production/DSL v2 cần spec/plan riêng sau khi xem chuyển động. Người dùng đã xác nhận bản đầu dùng ảnh/state nguyên khối hiện có.

## Global constraints

- Giữ pipeline gốc, database và DSL v1; không thay schema/migration/RLS, model, router hoặc job handler.
- Không tiếp tục AnimatedDrawings, không dùng Motion Canvas/ToonCrafter/LivePortrait/Rhubarb.
- Không thêm/nâng package; không import trực tiếp dependency gián tiếp @remotion/paths.
- 1920×1080, 30 fps, 600 frame; MVP 1 nhân vật với approved states và 1 background đúng 16:9.
- Cảnh có ba nhóm background tĩnh, midground tĩnh, foreground động. Midground tùy chọn tối đa 8 item, foreground tối đa 1 nhân vật chính + 4 prop; asset phải có sẵn/được duyệt.
- Default horizon đề xuất y=0.40; không dùng default chưa xác nhận để tự coi ground layout hợp lệ. Người dùng đã xác nhận foreground luôn ở trước midground; không thêm occluder/depth-order động ở bản đầu.
- Cùng props snapshot/presetVersion cho preview/export; frame thuần, không thời gian thực/ngẫu nhiên không seed.
- Không viết/sửa/chạy file test hoặc bộ test mới. Lint/typecheck/build được phép; yêu cầu test mới phải plan/duyệt riêng.
- Không commit/push tự động, không reset/clean dirty workspace. Thiết lập workspace cô lập trước implementation, bảo toàn thay đổi local.
- Không chạy clip/test của AnimatedDrawings bằng approval cũ. Dữ liệu thử cũ được giữ, không xóa.

## Review focus

1. Seek ngược/nhảy frame không làm đổi pose hoặc rung; không tích lũy state theo render trước đó.
2. Flip, anchor, squash và camera không làm chân trôi; hop không làm y-sort/depth scale nhảy theo thân.
3. Các state có ảnh trim khác nhau, state thiếu và asset đổi sau preview không bị che giấu bằng fallback im lặng.
4. Ground-plane validation và crop không làm scale sai; flat không có horizon giả; đường đi cần hợp lệ toàn đoạn.
5. Concurrency không là quota VRAM; 20 giây thực sự 600 frame, cut/fade không làm ngắn timeline và caption không bị rung theo camera.

Những điểm này là tiêu chí review sản phẩm, chưa cho phép tạo/running test files. Nếu muốn tự động hóa, trình riêng phạm vi test theo AGENTS.md.

## Task 1: Pure motion primitives và hợp đồng nội bộ lab

**Create:**

- `src/lib/animation/types.ts`: input/pose/presetVersion serializable, không phụ thuộc DB.
- `src/lib/animation/schema.ts`: Zod cho lab draft, giới hạn/polygon/asset refs.
- `src/lib/animation/motion.ts`: evaluateMotion/evaluateCamera, clamp/envelope/timing.
- `src/lib/animation/ground.ts`: evaluateGroundScale và validation đường đi.

**Interfaces:**

- Consumes: frame/fps/preset/intensity/seed, foot và layout từ spec §4–6.
- Produces: pose số hữu hạn, identity ngoài segment; ground height hoặc lỗi rõ; không React hook/DB/IO trong evaluator.

- [x] Đọc spec và source Remotion đúng tag, kiểm tra lại phiên bản lockfile.
- [x] Định nghĩa closed enum: idle_bob, walk_bob, run_bob, hop, recoil, squash, camera_shake; intensity subtle/normal/strong.
- [x] Chốt tham số số từng preset, ghi presetVersion=1 và đơn vị; amplitude tương đối chiều cao sprite, rotation độ. Damping/duration/seed cố định trong input, không lấy giờ hệ thống.
- [x] Body clips không overlap, [from,to), progress clamp, envelope về identity ở đầu/cuối. Di chuyển x/y tách khỏi local bob/hop.
- [x] Ground mode: horizon, epsilon, reference, vùng đứng; flat không áp scale; dùng ground foot để sort/bóng. Polygon 3–16 đỉnh, tối đa 4 vùng đơn không tự cắt.
- [x] Validate layer membership, unique ID, giới hạn item và fixed state của midground; không sort xuyên lớp. Cây/nhà không dùng công thức scale chiều cao nhân vật.
- [x] Ghi rõ không có tự nhận biết chân hoặc tự suy ra rig từ PNG.

**Verification:** lint/typecheck sau khi module được nối vào bước 2; không tạo test file.

## Task 2: Showcase riêng và lab preview trong Cartoon

**Create:**

- `src/remotion/showcase/AnimationShowcase.tsx`: timeline 5 shot/600 frame và camera/caption/debug.
- `src/remotion/showcase/AnimatedSprite.tsx`: anchor/pose/flip, nguồn ảnh URL/static.
- `src/remotion/showcase/SceneLayers.tsx`: nhóm background/midground/foreground với thứ tự vẽ rõ; không auto-segment ảnh flatten.
- `src/remotion/showcase/index.tsx`: entry đăng ký riêng composition AnimationShowcase.
- `src/components/scene/animation-lab.tsx`: chọn asset/state, intensity, anchor và layout draft; Player và tải draft JSON.
- `src/app/scenes/animation-lab/page.tsx`: listSeries + catalog read-only theo lựa chọn.
- `src/app/scenes/animation-lab/actions.ts`: validate draft, resolve approved refs, trả props và fingerprint; không mutate DB.

**Do not modify:** `src/remotion/SceneView.tsx`, `helpers.ts`, `Root.tsx`, `VideoComposition.tsx`, `src/lib/scene/schema.ts`.

**Interfaces:**

- Consumes: pure modules task 1; listSeries/loadApprovedCatalog/dataPath hiện có.
- Produces: lab draft theo spec, resolved serializable props dùng chung cho preview/export, fingerprint map cho asset đã chọn.

- [x] Asset resolver chỉ dùng series đã chọn và approved variants; chuyển Map sang dữ liệu serializable trước truyền vào client.
- [x] Thêm route /scenes/animation-lab, link trở lại playground; không cần đổi menu hoặc tạo editor timeline tổng quát.
- [x] Cho chọn background/nhân vật, intensity, debug; state thiếu hiển thị rõ và không tự gọi tạo asset.
- [x] Chọn/đặt midground item tĩnh và foreground prop từ cùng approved catalog; plate/cutout không phù hợp thì báo rõ. Nền nguyên khối là chế độ tương thích với midground rỗng, không coi là ảnh đã tách lớp.
- [x] Layout nhập số/JSON: horizon, polygon, reference, near/far foot và anchor từng state; sai thì hiện lỗi, không preview/export như hợp lệ.
- [x] Editor luôn có default horizon y=0.40 để chỉnh/reset; cần xác nhận ground layout trước export. Flat không dùng horizon tính phối cảnh. Không clip mái nhà/ngọn cây theo đường horizon.
- [x] Chỉ chấp nhận background 16:9 ở bước A, xác minh kích thước ảnh; thiếu asset phù hợp thì trả prerequisite cho người dùng.
- [x] Dựng 5 shot theo spec, chia clip body không overlap; dùng frame cục bộ đúng một lần. SVG arrow là primitive minh họa, không tự mạo danh asset catalog.
- [x] Transform nhóm theo thứ tự spec; caption/debug độc lập camera; debug toggle không sửa timing.
- [x] Tải draft JSON không chứa key/path tùy ý; resolve lại phía server/CLI khi dùng lại.
- [x] Giữ v1 sản xuất nguyên trạng, không tự diễn hoạt mọi cảnh cũ theo preset mới.

**Verification:** `npm run lint`, `npx tsc --noEmit`, `npm run build`. Nếu baseline lỗi ngoài phạm vi, ghi lỗi và không tự sửa ngoài scope. Chưa chạy test suite.

## Task 3: Xuất showcase bằng renderer hiện có

**Create:**

- `src/worker/render-animation-showcase.ts`: CLI riêng, không thêm vào queue handlers.

**Interfaces:**

- Consumes: draft JSON path nằm trong DATA_DIR, series/catalog hiện có, component/evaluators task 2.
- Produces: snapshot/run manifest và output MP4 dưới `data/experiments/remotion-animation/<run-id>/`; không ghi renders/scenes/job_runs.

- [x] CLI nhận draft path và concurrency số nguyên 1–4, mặc định 1; reject input sai trước render.
- [x] Resolve catalog hiện tại, so fingerprint preview; asset khác/không còn approved thì yêu cầu xem lại thay vì dùng im lặng.
- [x] Copy đúng bytes asset vào publicDir riêng, tính SHA256, lưu config/presetVersion/Remotion version/resolution/fps/concurrency. Validate đường dẫn qua dataPath, không nhận URL mạng tùy ý.
- [x] Bundle entry showcase bằng cùng cách webpack alias @ của render-jobs.ts; ensureBrowser/selectComposition/renderMedia dùng API 4.0.537.
- [x] Xuất H.264 1080p/30fps/600 frame, im lặng; dùng cùng component/props snapshot với Player. Không thay render-jobs.ts hoặc môi trường global.
- [x] Hỗ trợ xuất frame tham chiếu bằng renderStill khi được yêu cầu, không gọi đó là bộ test.
- [x] Ghi lỗi/render config vào manifest; output thất bại không được mang tên success. Giữ log và asset snapshot để review.
- [x] README có cách chạy qua worker container bằng tsx trực tiếp (container được inject env; không yêu cầu .env trong image), không đưa secret lên CLI.

**Verification:** typecheck/lint/build; file manifest chỉ là artifact vận hành. Việc chạy render bàn giao sẽ được yêu cầu/duyệt khi bắt đầu implementation, không thực hiện trong lượt lập plan này.

## Task 4: Bàn giao và cổng chuyển production

**Create:** `docs/DangLee_ImplePlan/REMOTION_ANIMATION_SHOWCASE_REPORT.md` sau khi có output thực tế.

- [x] Ghi preset settings và mapping API đã dùng, prerequisites còn thiếu, phiên bản và đường dẫn output thật.
- [ ] Bàn giao MP4 sau khi có nền 16:9 đã duyệt; lab đã mở. Người dùng đánh giá body motion, anchor, phối cảnh và cường độ sau khi có output.
- [ ] Sau khi người dùng xem output, xử lý yêu cầu đổi preset với version rõ.
- [ ] Chỉ sau khi chuyển động đạt mới viết spec B; chưa triển khai trong plan A.

## Công việc không nằm trong plan

Không schema/migration, không tích hợp scenes.generate v2, không rig tách bộ phận ở bản đầu theo lựa chọn của người dùng, không audio/lipsync, không engine khác, không nâng package, không tự viết/chạy test và không tối ưu GPU theo benchmark chưa thực hiện.

## Nguồn và điều kiện phê duyệt

Các API tham chiếu được liệt kê tại spec §9, đều tag v4.0.537. Phiên bản/package đã đọc từ repo, không lấy bảng cũ trong CLAUDE.md.

Người dùng đã chốt ảnh/state nguyên khối trước và foreground luôn ở trước midground trong mô hình ba lớp. Default horizon 0.40 là đề xuất biên soạn, có thể chỉnh theo nền. Người dùng đã duyệt spec và phạm vi A trong chat ngày 2026-10-23; bước B vẫn cần spec/plan và phê duyệt riêng.


## Kết quả triển khai

Code bước A đã triển khai trên feat/remotion-animation-showcase. Lint/typecheck/build pass. Lab local cổng 3001 hoạt động; MP4/đánh giá chuyển động còn chờ nền 16:9 approved. Xem ../../DangLee_ImplePlan/REMOTION_ANIMATION_SHOWCASE_REPORT.md. Checkbox phần export thể hiện công cụ đã viết, không phải render MP4 đã được thực hiện.

