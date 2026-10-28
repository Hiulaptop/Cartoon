# Smoke test thủ công — Puno tại tiệc trà Boston

Trạng thái: **r2 COMPLETE / manual smoke PASS theo amendment user: ảnh fill tới viền**. MP4 30giây/1920×1080/30fps/900frame không audio đã kiểm metadata và phát hết không lỗi. Lượt r1 giữ nguyên bằng chứng blocked; r2 dùng background ngang1376×768 đã tạo ở series DIMENSIONS, import bản sao vào series smoke, review và ghép bằng cover vào1920×1080. Không đổi source pixels hoặc giả native resolution. Nhánh feat/asset-generation-dimensions, giữ các thay đổi trước, chưa commit/push. Kết quả: [smoke report](../../DangLee_ImplePlan/BOSTON_TEA_PARTY_SMOKE_REPORT.md); [inventory/checkpoint](../../DangLee_ImplePlan/BOSTON_TEA_PARTY_SMOKE_CHECKPOINT.md).

## Mục tiêu

Dựng clip 30 giây, ngang 16:9, 30 fps, không thoại/phụ đề/audio: Puno dịch chuyển tới cảng Boston, nhìn hai công nhân ném toàn bộ bốn thùng trà xuống nước. Bốn là số thùng cụ thể để kiểm chứng 'tất cả'; cuối cảnh không còn thùng nào trên bến.

Người dùng yêu cầu tách asset và bối cảnh trước khi ghép. Không sinh một ảnh/video nguyên cảnh có sẵn tất cả nhân vật và hành động.

## Ranh giới với pipeline hiện tại

Dùng pipeline gốc cho asset: brief → asset.generate_base/variant qua queue → 9router → keyAndTrim/toPng → pending_review → xem ảnh → duyệt → approved catalog → snapshot → ghép Remotion → MP4.

Lab bước A hiện chỉ có showcase preset cố định 20 giây, một nhân vật chính và prop không có quỹ đạo x/y. DSL v1/scenes.generate cũng chưa mô tả được dịch chuyển, nhiều công nhân động và ném thùng. Smoke này dùng composition Remotion riêng cho nội dung cảnh, tái sử dụng catalog/snapshot/asset helpers; **không gọi đó là đã kiểm chứng scenes.generate hoặc video.render của production từ đầu đến cuối**. Không sửa DSL/schema/handler hoặc tự triển khai bước B.

## Dữ liệu và phân rã asset

Tạo series local riêng `SMOKE — Puno Boston Tea Party — 2026-10-23`, ghi series ID/run ID trong manifest. Không đổi asset, approval hay file nguồn của series Rock, Paper, Puno.

- Puno: tái sử dụng ảnh base đã duyệt, giữ đúng SHA256 và nguồn; có thể import bản sao vào series smoke với provenance, không tự vẽ lại nhận dạng Puno.
- `bg_boston_harbor_far`: nền 16:9 chỉ trời/cảnh cảng xa/đường chân trời, không nhân vật, không thùng, không bến tiền cảnh.
- `prop_boston_water`: mặt nước cảng gần bến có alpha, tách riêng khỏi trời/cảnh xa; không vẽ sẵn thùng hoặc splash.
- `prop_boston_pier`: bến gỗ/sàn cầu cảng có alpha, asset riêng.
- `prop_boston_merchant_ship`: tàu thương gia tĩnh có alpha, asset riêng.
- `chr_boston_docker`: công nhân riêng, full-body, style tương thích; cả base và variant angry đều tay không, không vẽ thùng trong ảnh người. Base có bàn tay ở tư thế ôm khoảng trống để ghép prop, variant angry có tư thế buông/ném tay không qua feedback hiện có. Dùng hai instance, lệch thời gian hành động, không sinh hình hai người chung một ảnh.
- `prop_boston_tea_crate`: thùng trà gỗ riêng có alpha; bốn instance trong cảnh, không bốn thùng gộp một ảnh.
- `fx_boston_portal`: hiệu ứng dịch chuyển riêng có alpha.
- `fx_boston_splash`: nước bắn riêng có alpha.

Tám asset mới và một variant công nhân: tối đa chín job sinh ảnh ban đầu. Nếu ảnh cần sửa, chỉ tối đa hai job sửa thêm theo feedback cụ thể; retry mạng của queue giữ cơ chế ba attempt hiện tại và ghi log. Không tự thêm model hoặc asset ngoài danh sách.

**Amendment user đã duyệt khi resume:** background1376×768 được fit cover kín khung16:9 trong composition smoke, giữ tỷ lệ, crop nhẹ ở mép và ghi transform/horizon thực trong manifest; không bắt source native16:9. Với1920×1080, cover scale1.40625, ảnh hiển thị1935×1080, cắt7.5px mỗi bên. Chỉ thay cách ghép background của smoke, không đổi guard lab/production renderer hoặc resize file catalog. Dimension đã triển khai riêng; mọi generation mới dùng requested preset và transport mapping đã duyệt.

Import Puno approved bằng đúng bytes/provenance; import background ngang đang pending_review thành bản sao pending_review trong series smoke rồi agent review, không thay approval ở series nguồn. Giữ tổng budget9job ban đầu: r1 đã dùng1job bg; r2 tái sử dụng nền nên còn7base+1worker angry. Tối đa2feedback jobs theo plan cũ. Không dùng asset chưa approved trong render.

Không mock/stub hoặc fixture giả. Asset và output là dữ liệu nội dung thật của cảnh yêu cầu, được ghi rõ thuộc series smoke local. Không tạo test unit/e2e hoặc chạy *.test.* / *.spec.* hiện có.

## Review asset và quyền ghi

Chỉ ghi dữ liệu instance vào các bảng hiện có: series/assets/asset_variants/job_runs/reviews; không schema/index/RLS/migration. Khi duyệt plan này, agent được xem từng ảnh và duyệt **chỉ asset/variant thuộc series smoke**, ghi provenance review của agent trong report/reason; không giả rằng người dùng đã duyệt nghệ thuật. Không sửa approval của dữ liệu cũ. Asset không đạt thì dùng reject/feedback có giới hạn, không force approved để chạy qua.

Nếu cần sửa tay tên/description ở bước duyệt, giữ naming kind đúng chuẩn; không đổi worker thành prop để vượt giới hạn draft. Không public upload hoặc gọi YouTube.

## Các lớp và timeline dự kiến

- Background: trời/cảng xa và mặt nước xa tĩnh.
- Midground: mặt nước gần, bến và tàu tĩnh là các asset riêng ghép bằng alpha; horizon default 0.40 được cân lại theo ảnh thật.
- Foreground: Puno, hai instance công nhân, bốn instance thùng, portal/splash. Luôn vẽ phía trước midground; không tự chuyển lớp theo y.

Timeline 900 frame:

1. 0–179: portal bật, Puno xuất hiện bằng scale/opacity, portal tắt; không hiện subtitle.
2. 180–299: Puno đi/bob tới vị trí quan sát, công nhân chuẩn bị cạnh các thùng.
3. 300–779: hai công nhân luân phiên đổi pose và ném cả bốn thùng theo quỹ đạo cong; thùng xoay, chạm nước có splash rồi biến mất. Thùng đang cầm đồng bộ vị trí tay; sau release mới đi theo quỹ đạo. Không tự làm rig tách tay/chân.
4. 780–899: giữ toàn cảnh, Puno phản ứng bằng pose/scale, toàn bộ thùng đã xuống nước, công nhân dừng.

Có thể điều chỉnh vài frame để khớp asset nhưng giữ đủ 30 giây và bốn lần thùng rơi xuống nước. Chuyển động từ Remotion interpolate/Easing/spring/random có seed, không video AI.

## Kịch bản kiểm tra cụ thể

1. Preflight: app/worker/DB local, router GET/models, source/version và dung lượng; không reset/dừng dữ liệu cũ.
2. Background generation: log job ID, request không chứa secret, kiểm bytes/kích thước thật; sai tỷ lệ phải fail, không tự sửa.
3. Asset isolation: mỗi file chỉ chứa đúng nhân vật/đồ vật/lớp được yêu cầu; PNG cutout có pixel trong suốt thật, không viền xanh lớn, không text/watermark. Puno khớp nguồn approved.
4. Pipeline approval/catalog: asset pending_review không lọt vào catalog; chỉ sau review/approval mới resolve. Ghi đủ IDs, status và hash; không dùng ảnh ngoài catalog cho render cuối.
5. Composite: layer order đúng, chân đứng trên bến, tỷ lệ theo horizon/reference; không có worker/thùng bị gộp trong background; không phát thoại/audio/subtitle.
6. Motion: portal có vào/ra, Puno xuất hiện rồi di chuyển; hai công nhân có pose action; cả bốn thùng rời bến, rơi theo cung, splash đúng vị trí; không còn thùng trên bến cuối cảnh.
7. Render: concurrency=1, H.264 1920×1080/30fps/900 frame. Xuất frame tham chiếu ở đầu, lúc ném, lúc chạm nước, cuối; kiểm duration/count/audio stream thực tế, xem clip và ghi lỗi thị giác thay vì chỉ exit code.
8. Fingerprint/provenance: asset snapshot đúng hash/file/source approved; giữ log lỗi/partial nếu render fail, không báo thành công hoặc tự chạy lặp vô hạn.

Đây là manual smoke checklist, không là test suite. Không thêm tình huống lỗi hoặc thêm test automation ngoài danh sách khi chưa duyệt.

## Công cụ và vị trí dự kiến

Phiên bản đã đối chiếu lockfile: Remotion/bundler/renderer 4.0.537, Sharp 0.35.5, Zod 4.6.7, Drizzle 0.45.4; Node 22 trong worker; Docker Engine 29.7.2/Compose 5.5.1 từ lần kiểm tra cùng phiên. Xác minh runtime đang dùng khi chạy.

- Dùng create/enqueue/review flow hiện có, không đổi hợp đồng 9router; IMAGE_MODEL/endpoint lấy env hiện tại, không in key.
- `scripts/spikes/remotion-boston/scene.tsx`: composition nội dung cảnh riêng, dùng asset đã resolve; không sửa Showcase/Scene DSL v1.
- `scripts/spikes/remotion-boston/index.tsx`: composition entry riêng.
- `scripts/spikes/remotion-boston/run.ts`: điều phối smoke, snapshot và render; không fixture/mock, không test suite.
- `data/experiments/remotion-boston/<run-id>/`: storyboard, asset manifest, ảnh nguồn/processed, review notes, snapshot, logs, MP4 và frame tham chiếu; không commit runtime data.
- `docs/DangLee_ImplePlan/BOSTON_TEA_PARTY_SMOKE_REPORT.md`: kết quả thật, các bước pass/fail/blocked và giới hạn production pipeline chưa được kiểm chứng.

## Nguồn đã đối chiếu

Code repo: asset-jobs.ts, assets/prompts.ts, ninerouter/client.ts, asset-actions.ts, queue/jobs.ts; Remotion spec/plan hiện hành.

Nguồn chính thức qua Context7: [9router image API và các khác biệt size/aspect theo provider](https://github.com/decolua/9router/blob/master/skills/9router-image/SKILL.md), [Remotion interpolate](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/interpolate.mdx), [renderMedia](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/renderer/render-media.mdx).

