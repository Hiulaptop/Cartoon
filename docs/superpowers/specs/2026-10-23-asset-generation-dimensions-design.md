# Preset dimension trước khi tạo asset — pipeline gốc

Trạng thái: **APPROVED trong chat 2026-10-23, gồm bổ sung transport mapping Antigravity; đã triển khai**. [Kết quả và giới hạn](../../DangLee_ImplePlan/ASSET_GENERATION_DIMENSIONS_REPORT.md). User yêu cầu preset trước khi tạo asset. Smoke Boston PAUSED theo yêu cầu và không tự resume.

**Finding và bổ sung đã duyệt:** [điều tra provider](../../DangLee_ImplePlan/IMAGE_PROVIDER_DIMENSION_INVESTIGATION.md) xác định aliasag=Antigravity ở source release, runtime báo0.5.104, wire size1920x1080 bị map fallback1:1. Giữ requested preset trong DB/UI/prompt; client map riêngag/antigravity1920x1080→1792x1024,1080x1920→1024x1792. Metrics ghi requestedSize/transportSize riêng; preset khác và provider khác giữ nguyên, NULL bỏ keysize. Đây là yêu cầu tỷ lệ, không hứa pixel native.

## Mục tiêu và giới hạn

Thêm preset kích thước yêu cầu trên form tạo asset của pipeline Remotion hiện tại. Lựa chọn theo asset được dùng lại khi sinh base, biến thể, reject/regenerate và retry; không yêu cầu operator chọn lại mỗi lần. Lưu riêng kích thước yêu cầu, kích thước ảnh model thực trả và kích thước PNG sau xử lý để không gây hiểu nhầm.

Không khôi phục Pipeline A/ComfyUI; không thay Scene DSL v1, kích thước video1920×1080, cách Sprite lấy chiều cao trong cảnh hoặc cơ chế duyệt hiện tại. V1 không thêm crop/resize asset có sẵn, width/height tùy ý, editor bố cục, sửa preset sau khi asset đã tạo hoặc đổi model tự động.

## Hiện trạng đã đối chiếu

- Branch hiện tại `feat/remotion-animation-showcase`, worktree `C:/Users/asus/.t3/worktrees/Cartoon/feat-remotion-animation-showcase`, có baseline Docker/Supabase và Step A Remotion chưa commit; giữ nguyên chúng. Không còn lập kế hoạch từ checkout `build/local-supabase` như bản nháp đầu.
- package.json/lockfile: Next15.5.28, React19.1.0, Remotion4.0.537, Sharp0.35.5, Zod4.6.7, Drizzle ORM0.45.4, drizzle-kit0.31.11, Supabase CLI2.121.0; Docker dùng Node22 bookworm.
- `CreateAssetForm` chỉ có kind/brief/displayName. `createAsset` enqueue asset.generate_base trước khi worker tạo record assets.
- `generateImage` gửi model/prompt tới `/images/generations?response_format=binary`; chưa có size. `imagePrompt` đang hardcode background16:9.
- Worker chuẩn hóa background sang PNG; chr/prop/fx qua keyAndTrim. asset_variants.width/height là kích thước PNG sau xử lý; catalog/Remotion dùng hai trường này để giữ tỷ lệ ảnh thật.
- Knowledge graph `.ua` đã truy vấn cho asset→worker→catalog→SceneView; đối chiếu file nguồn vì graph chưa bao hết các thay đổi local/deprecation mới.
- Đọc-only router hiện tại: GET models/image thành công với1 entry; GET models/info cho IMAGE_MODEL thành công nhưng chỉ có capabilities=[textToImage], không công bố enum size. Không gọi sinh ảnh trong giai đoạn lập plan.
- Bằng chứng smoke trước khi pause: một job `asset.generate_base` thành công bằng `ag/gemini-3.1-flash-image`, prompt đòi 16:9 nhưng trả 1024×1024; request chưa có size. Đây chỉ chứng minh prompt không đủ, chưa chứng minh provider sẽ nhận size. Xem [checkpoint](../../DangLee_ImplePlan/BOSTON_TEA_PARTY_SMOKE_CHECKPOINT.md).
- Tài liệu 9router upstream ghi nhánh `gemini` bỏ qua `size`/`n`, nhưng không áp dụng nhận định đó cho aliasag. Điều tra read-only đã đối chiếu runtime0.5.104 với source release: Antigravity đọc size qua bảng ratio giới hạn, không có1920x1080/1080x1920. Chưa kiểm trực tiếp custom code server hoặc generation có size; ghi riêng observed deployment và release-source evidence. Không yêu cầu thêm secret trong chat hoặc tự sửa router.

## Thiết kế đề xuất

### Preset và ý nghĩa

Form thêm select **Kích thước yêu cầu** gồm:

- Mặc định model (`model_default` ở form, lưu NULL).
- `1024x1024` — Vuông1:1.
- `1920x1080` — Ngang16:9.
- `1080x1920` — Dọc9:16.
- `1536x1024` — Ngang3:2.
- `1024x1536` — Dọc2:3.

Agent đề xuất mặc định **Mặc định model** để hành vi cũ không đổi. Một allowlist dùng chung cấp label, width/height và aspect label cho UI/action/worker/prompt; không nhân bản danh sách ở nhiều nơi. V1 không nhập dimension tự do.

Preset là kích thước canvas **yêu cầu khi sinh ảnh**, không cam kết model luôn tạo chính xác số pixel. Client gửi `size` khi có preset; chế độ mặc định bỏ hẳn key này. Một số provider chỉ quy đổi thành aspect ratio hoặc bỏ qua size theo tài liệu9router. Không quảng cáo1920×1080 như độ phân giải native đã xác minh.

V1 gửi `size` của9router sau mapping Antigravity đã duyệt, không tự thêm aspect_ratio/imageConfig/generationConfig hoặc đổi provider. Nếu model không tuân thủ thì chỉ bảo đảm truyền yêu cầu + hiển thị kết quả thật. Không coi là đã mở smoke Boston khi chưa đo/review ảnh thật. Adapter khác cần scope riêng. Output16:9 khác số pixel vẫn cảnh báo pixel mismatch; đó không phải bằng chứng native1920×1080.

Copy cạnh select: “Gửi kích thước này cho model. Kết quả tùy khả năng model; nhân vật/đạo cụ/hiệu ứng còn được cắt nền sau khi sinh.” Không thêm bước resize/stretch/pad để giả vờ model tuân thủ.

### Lưu và truyền lựa chọn

Thêm `assets.generation_size` nullable text. NULL giữ hành vi cũ cho asset hiện có và job cũ không có field. Preset được lưu khi worker lần đầu tạo asset; sau đó DB là nguồn chính cho mọi lượt sinh của asset đó. Retry của create-base không ghi đè preset đã lưu và không lấy width/height PNG đã trim làm size cho lần kế tiếp.

Payload asset.generate_base thêm `generationSize?: AssetGenerationSize | null`. Action parse allowlist; worker validate lại vì job có thể được enqueue từ nơi khác. Job cũ thiếu field hợp lệ và tương đương NULL. Không thêm loại job mới. Variant/retry/reject không cần truyền preset từ browser: worker đọc từ assets.

### Prompt và gọi9router

`generateImage` thêm optional requested `size`. Khi có preset, chọn transportSize theo mapping đã duyệt rồi gửi JSONsize; giữ model/prompt, endpoint binary và sniff định dạng hiện tại. Return transportSize để worker ghi metrics; low-level không sửa preset DB.

Background dùng aspect tương ứng preset thay hardcode16:9. Với NULL, giữ nguyên prompt cũ (background wide16:9). Với chr/prop/fx vẫn giữ full-body/single-object, centered và nền xanh; thêm hướng dẫn canvas theo preset mà không sửa mô tả nhận dạng cố định. Không thay proposalMessages/AssetProposal của LLM.

Nếu provider từ chối request (HTTP400/422), báo lỗi yêu cầu ảnh, không tự đổi size/model hoặc retry tự động cùng request không hợp lệ. Các lỗi mạng/429/5xx giữ cơ chế retry hiện tại. Nếu provider trả200 nhưng kích thước khác, vẫn giữ ảnh thật cho user duyệt; hiển thị cảnh báo thay vì tự tạo thêm request tốn lượt.

### Kích thước thực và giao diện sau khi sinh

Đọc metadata ảnh binary model trả bằng Sharp trước keyAndTrim/toPng. Thêm `asset_variants.source_width/source_height` cho kích thước ảnh nguồn này; width/height hiện có tiếp tục là PNG sau xử lý. Không ghi đè width/height bằng số preset.

Trang asset hiển thị preset ở thông tin chung, và trên mỗi variant:

- Kích thước ảnh model thực trả, khi đã biết.
- Kích thước PNG sau xử lý, dùng trường hiện có.
- Nếu preset không NULL và source dimensions khác preset: “Model trả X×Y, khác kích thước yêu cầu W×H.” Đây không phải lỗi do trim, và ảnh vẫn pending_review theo quy trình cũ.

Asset/variant cũ source dimensions NULL hiển thị “Chưa ghi nhận” và không báo mismatch dựa vào PNG đã trim. Không backfill bằng suy đoán. Có thể xem requested/source/processed dimensions trong metrics job thành công để chẩn đoán.

Khi bắt đầu regeneration, source_width/source_height cùng được reset NULL trong upsert generating; chỉ ghi cặp mới sau khi xử lý file thành công. UI không hiển thị cặp nguồn hoặc warning cũ như kết quả lượt mới đang generating/failed. Không thay file path/width/height hiện có ở bước bắt đầu để tránh mở rộng thay đổi pipeline; các trường này vẫn là lần lưu file thành công gần nhất. Không gán kích thước mới nếu generation thất bại.

### Hợp đồng DB cần duyệt

Migration additive duy nhất, dự kiến0003 sau khi xác nhận journal vẫn kết thúc0002:

1. `assets.generation_size TEXT NULL`, không backfill; CHECK `assets_generation_size_allowed`: NULL hoặc một trong5 chuỗi preset nêu trên. Không dùng PostgreSQL enum để tránh thay enum khi thêm preset sau này.
2. `asset_variants.source_width INTEGER NULL`, `source_height INTEGER NULL`, không backfill; CHECK `asset_variants_source_size_valid`: cả hai NULL, hoặc cả hai NOT NULL và >0.

Không thêm bảng/index/RLS policy, không sửa SQL lịch sử hoặc reset dữ liệu. Drizzle schema/type được cập nhật theo3 cột trên. Payload client→server→queue và body size gửi9router thuộc phạm vi contract cần user duyệt theo AGENTS.md. Mọi thay đổi ngoài phạm vi này phải trình lại.

Triển khai local phải phối hợp app/worker: đợi asset job đang chạy hoàn tất, tạm dừng producer/worker khi chuyển phiên bản; backup và apply migration additive, khởi động app/worker cùng bản mới trước khi nhận job có generationSize. Không để worker cũ nhận payload preset rồi lưu NULL. Database cloud và dịch vụ project khác không bị tác động.

## Tiêu chí hoàn thành

1. Chọn preset trước tạo asset, server/worker giữ cùng giá trị và request ảnh có size đúng; Mặc định model không gửi size.
2. Base và các đường variant/reject/retry dùng preset đã lưu theo asset; job/asset cũ vẫn chạy với NULL.
3. Prompt background không còn mâu thuẫn preset1:1/9:16; mô tả trait không bị thêm dimension cố định.
4. UI và metrics phân biệt requested/source/processed; mismatch200 được báo, không crop/stretch/retry ngầm. Lỗi400/422 không lặp request tự động.
5. Scene DSL/catalog/Sprite tiếp tục dùng kích thước file thật, preview/render pipeline gốc mở được.
6. Migration local additive, dữ liệu cũ giữ nguyên. Không tự chạy migration cloud.

## Xác minh và giới hạn

Tuân AGENTS.md: không tạo/sửa/chạy test files, fixtures hoặc mocks. Dùng lint/typecheck/build và kiểm chứng vận hành trên dữ liệu thật sau khi plan được duyệt. Không gọi sinh ảnh hoặc áp migration khi mới lập tài liệu. Chỉ chạy vài yêu cầu ảnh đại diện trong phạm vi kiểm chứng được duyệt, không tự chạy ma trận mọi preset/model hoặc cố tình phát sinh request sai để khảo sát provider.

Việc preset được gửi đúng không chứng minh provider hỗ trợ chính xác mọi size. Router bản đang dùng không trả size enum qua endpoint đã probe, nên khả năng native1920×1080 hiện chưa xác minh. Giải pháp đảm bảo pixel tuyệt đối bằng hậu xử lý là một scope khác nếu user cần.

## Nguồn

- [9router image API và provider quirks](https://github.com/decolua/9router/blob/master/skills/9router-image/SKILL.md), đối chiếu qua Context7 `/decolua/9router`; docs upstream không chứng minh phiên bản triển khai của router hiện tại giống master.
- [Sharp0.35.5 input metadata](https://github.com/lovell/sharp/blob/v0.35.5/docs/src/content/docs/api-input.md), [output metadata](https://github.com/lovell/sharp/blob/v0.35.5/docs/src/content/docs/api-output.md), đối chiếu Context7 `/lovell/sharp/v0.35.5`.
- [Drizzle constraints](https://orm.drizzle.team/docs/indexes-constraints), [generate](https://orm.drizzle.team/docs/drizzle-kit-generate), đối chiếu Context7 `/drizzle-team/drizzle-orm-docs`; cú pháp/tool thực tế phải dùng phiên bản lockfile.
