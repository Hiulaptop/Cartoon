# Truyện dẫn, lời giải không code, bộ asset Pixel Farm, gán asset tự động

Ngày: 2026-10-25. Trạng thái: chờ user duyệt. Phạm vi: luồng bài giảng thuật toán (`/designs/[id]/algorithm/...`).

## 1. Mục tiêu

1. Bước 1 nhận **chủ đề** qua ô chat; AI viết truyện ngắn dẫn dắt rồi mô hình hoá thành đề bài.
2. Lời giải và kịch bản **không chứa code**; chỉ có ý tưởng, hướng tư duy, mã giả, và lưu ý cài đặt cho C++ / Python.
3. Có bộ asset pixel art cố định (series `Pixel Farm`, 20 asset), chọn khi tạo bài giảng; thiếu thì sinh thêm vào chính series đó và chờ duyệt.
4. Bước gán asset do hệ thống làm; người dùng chỉ xem lại và duyệt ảnh mới.

Ngoài phạm vi: chat nhiều lượt, bảng lưu hội thoại, stage `story` riêng, pipeline cartoon cũ, sinh biến thể ngoài `base` khi seed.

## 2. Quyết định đã chốt (với user)

- Truyện ngắn dẫn → mô hình hoá thành bài tập (không phải truyện độc lập).
- Chỉ nhập chủ đề, AI tự ra đề. Một ô nhập, muốn đổi thì nhập lại và sinh bản mới.
- "Bộ asset sẵn" = `series` hiện có (không thêm bảng pack).
- Hướng A: mở rộng stage `problem`, không thêm stage `story`.

## 3. Hợp đồng dữ liệu

### 3.1 `AlgorithmProblemV2` (`src/lib/algorithm/contracts.ts`)

```
{ version: 2, theme: string, topic?: string, story: string, modeling: string, text: string }
```

- `theme` chủ đề người dùng nhập; `topic` dạng thuật toán người dùng chọn (tuỳ chọn, rỗng thì AI tự chọn).
- `story` truyện ngắn (tiếng Việt, 120 đến 400 từ); `modeling` đoạn nối truyện sang bài toán (ánh xạ nhân vật/sự kiện sang đại lượng); `text` đề bài hình thức (cùng nghĩa với V1, các stage sau tiếp tục đọc `text`).
- Revision V1 (người dùng dán) vẫn hợp lệ; mọi nơi đọc problem phải xử lý cả hai phiên bản (`contractVersion` đã có ở `algorithm_revisions`).
- `source` của revision AI là `ai`; bản V1 là `manual`.

### 3.2 `AlgorithmSolutionV2`

Khác V1: **bỏ `code`**, `representation` luôn `explanation`, thêm:

```
pseudocode: string            // mã giả có cấu trúc, tối đa 20_000 ký tự
languageNotes: { cpp: string, python: string }   // lưu ý cài đặt, mỗi mục 1..5_000 ký tự
```

- `languageNotes.cpp`: ví dụ kiểu dữ liệu đủ rộng (`long long`), I/O nhanh, tránh tràn, đệ quy sâu.
- `languageNotes.python`: ví dụ dùng cấu trúc dữ liệu có sẵn, giới hạn đệ quy, chi phí vòng lặp thuần.
- Revision V1 cũ vẫn hiển thị; sinh lại luôn ra V2.

### 3.3 Kiểm máy "không code" (`src/lib/algorithm/solution-check.ts`)

Từ chối (kèm lỗi cụ thể để vòng sửa của `generateStructured` dùng) nếu `insight`, `algorithm`, `correctness`, `walkthrough`, `languageNotes.*` chứa: hàng rào markdown ```` ``` ````, `#include`, `using namespace`, `int main`, dòng bắt đầu bằng `def `/`class `/`import `/`from ... import`, hoặc `;` kết thúc dòng kiểu C. `pseudocode` cũng bị kiểm bằng cùng bộ mẫu (mẫu chỉ chặn cú pháp C++/Python, không chặn từ khóa mã giả như nếu/với mỗi). Danh sách mẫu nằm ở một hàm thuần duy nhất.

### 3.4 Kịch bản

`AlgorithmScriptV1` giữ nguyên khuôn. Prompt đổi: kể theo `story` + `modeling`, nhân vật trong truyện đóng vai ẩn dụ; trường `code` của cảnh luôn `""` (bỏ câu "lấy nguyên văn từ lời giải"); `script-check.ts` thêm luật `code === ""`. Lời thoại không đọc ra code; có thể nhắc mã giả và lưu ý ngôn ngữ ở cảnh kết.

## 4. Schema DB

Một migration duy nhất: bỏ `'problem'` khỏi CHECK `algorithm_generation_runs_stage` (còn `stage <> 'done'`). Không thêm bảng, cột, enum.

Kiểm tra khi viết plan: trigger/CHECK khác trong các migration 0004 đến 0012 có chặn run của stage `problem` không (`algorithm_guard_*`); nếu có, sửa cùng migration.

## 5. Job và luồng

### 5.1 `algorithm.problem.generate` (`src/worker/algorithm-problem-jobs.ts`)

- Server action `generateProblemFromTheme`: kiểm đầu vào (chủ đề 3..500 ký tự), tạo revision `problem` trạng thái `generating` và `algorithm_generation_runs` **trước** khi đẩy job (cùng nguyên tắc ở M4), có `ModelPicker`/`chosenModel` như các stage khác.
- Worker dùng `generateStructured` (tối đa 2 lượt sửa máy): kiểm schema V2, độ dài truyện, `text` không rỗng và không chứa code. Hết lượt: `LlmContentError` → `PermanentJobError`.
- Kết quả `pending_review`; người dùng duyệt/từ chối/sửa tay như các stage hiện có (`decideRevision`).
- UI: `ProblemStep` thêm ô chủ đề + chọn dạng thuật toán (tuỳ chọn) + nút "Viết truyện và ra đề"; vẫn giữ đường dán đề thủ công.

### 5.2 `algorithm.assets.resolve` (`src/worker/algorithm-asset-resolve-jobs.ts`)

Kích hoạt khi script revision chuyển `pending_review` (cùng transaction với việc tạo `algorithm_asset_requests`).

1. Nạp `loadApprovedCatalog(seriesId)`.
2. Một lần gọi LLM (`generateStructured`) nhận catalog và danh sách request (`temporaryKey`, `brief`), trả cho mỗi request một trong: `{ use: assetName, state }` (biến thể đã duyệt), `{ newVariant: assetName, state, brief }` (asset có sẵn, thiếu trạng thái), `{ newAsset: {kind, name, displayName, brief} }`. Khuôn kiểm: tên asset phải có trong catalog hoặc đúng chuẩn đặt tên; `state` hợp lệ theo loại (bảng `allowedStates` hiện ở `approveAlgorithmAsset`, chuyển ra module dùng chung).
3. Trong một transaction: `use` → request `bound`; `newVariant`/`newAsset` → request `generating` và đẩy `algorithm.asset.generate` (job và `generateBase` đã có) vào **series của design**. Xong ảnh, request sang `pending_review` (hành vi hiện có).
4. Lỗi LLM hết lượt: các request còn lại giữ `open` để người dùng xử lý tay (đường cũ `approveAlgorithmAsset` giữ nguyên làm dự phòng).

Duyệt ảnh mới ở bất kỳ trang nào dùng chung `approve` hiện có; sau duyệt request chuyển `bound`. Cổng sang voice giữ nguyên (mọi request `bound`).

### 5.3 UI bước script

Thay danh sách "gán tay từng request" bằng bảng kết quả hệ thống: mỗi request hiển thị ảnh đã chọn/đang sinh/chờ duyệt, nút duyệt ảnh, nút "đổi sang asset khác" (dùng đường tay cũ). Nút "Gán asset lại" đẩy lại job resolve cho request còn `open`.

## 6. Bộ asset Pixel Farm

Series `Pixel Farm` (tên duy nhất). 20 asset, mỗi asset seed trạng thái `base`:

| Loại | Tên |
|---|---|
| bg (2) | `bg_meadow` (nền cỏ xanh), `bg_forest` |
| chr (5) | `chr_cat`, `chr_dog`, `chr_rabbit`, `chr_chicken`, `chr_farmer` |
| prop (12) | `prop_tree`, `prop_bush`, `prop_water_bucket`, `prop_well`, `prop_fence`, `prop_crate`, `prop_basket`, `prop_flower`, `prop_rock`, `prop_signpost`, `prop_fish`, `prop_apple` |
| fx (1) | `fx_sparkle` |

- Tên theo `asset-naming.md` (đã khớp CHECK `assets_name_format`).
- Biến thể khác `base` (idle, happy, walk...) sinh theo nhu cầu qua bước 5.2.
- Phong cách: hằng số prompt pixel art ở `src/lib/assets/` (nhãn "pixel art, 16-bit, bảng màu hạn chế, viền rõ, không khử răng cưa"), gắn vào prompt sinh ảnh của mọi asset trong series này; nền `bg` không dùng nền xanh chroma như hiện tại.
- Nạp bằng `npm run seed:pixel-farm` (tsx, idempotent): tạo series và 20 hàng `assets` + `asset_variants(base)` `draft`, rồi `enqueueJob` sinh ảnh; ảnh ra ở `pending_review`, **user duyệt từng ảnh**. Chạy lại chỉ bù asset thiếu.
- Form tạo bài giảng: chọn series, mặc định `Pixel Farm` nếu tồn tại.

## 6b. Video tự vẽ asset đã gắn (bổ sung, user duyệt 2026-10-25)

Chạy thử cho thấy composition bài giảng không vẽ asset. Bổ sung: mỗi cảnh lấy `assetKeys` của kịch bản đã duyệt, tra binding `bound` ra file ảnh đã duyệt (`loadBoundAssetFiles`), dựng `sceneAssets` tất định (`buildSceneAssets`, không gọi LLM, không đổi khuôn JSON animation). `SceneStage` (`src/remotion/algorithm/scene-stage.tsx`) vẽ "sân khấu" y 1060–1520: `bg` làm nền, tối đa 4 `chr`/`prop` đứng thành hàng (nhún nhẹ theo frame, `image-rendering: pixelated`), tối đa 2 `fx` nhấp nháy ở góc trên; cảnh có code thì không vẽ. Render chép ảnh vào `publicDir/assets/`; preview dùng URL `/api/files`. Không đổi DB, không đổi `asset_manifest`.

Điều chỉnh sau khi user xem video thử (duyệt 2026-10-25): video gồm **phần truyện** (1–2 cảnh đầu, tổng ≤ 25 giây, đoạn phim hoạt hình kể nhanh vấn đề) rồi **phần giảng** (hình ảnh học thuật). Chỉ cảnh truyện có `assetKeys` (vật thể/nhân vật/bối cảnh cụ thể, có một bối cảnh); cảnh giảng có `assetKeys = []`. `checkScriptRules` kiểm các luật này (`storySceneCount`, `STORY_MAX_SCENES = 2`, `STORY_MAX_SECONDS = 25`). Composition: cảnh có asset vẽ bằng `StoryScene` toàn màn hình (nền phủ kín có zoom chậm, nhân vật cỡ lớn trượt vào và nhún, hiệu ứng, tiêu đề); cảnh giảng dùng `SceneV2` như cũ, không còn "sân khấu". Prompt animation đánh dấu `story=true` để LLM không đặt `array` ở cảnh truyện.

Tăng chất lượng prompt (user yêu cầu 2026-10-26): prompt bước 1 buộc LLM xác định tính chất cốt lõi và chi phí của thuật toán rồi dựng truyện quanh chúng, giữ một mục tiêu nhất quán giữa story/modeling/text, có checklist tự kiểm. Prompt kịch bản yêu cầu cảnh truyện như storyboard, đúng một key `nen_` + 1–4 key nhân vật/vật thể (kiểm máy trong `checkScriptRules`), key mang trạng thái/cảm xúc khi cần. Bước gán asset nhận truyện gốc, mô tả cảnh, lời thoại và vai trò key; chỉ `use` khi đúng thực thể, khuyến khích `newVariant` theo trạng thái và `newAsset` khi danh mục thiếu, key `nen_` phải là `bg`, tối đa 6 ảnh mới (`checkResolution`).

Sửa sau lần chạy thử "Thỏ Bông" (2026-10-26): (1) `findSolutionLeaks` từ chối modeling có thao tác thuật toán hoặc O(...); (2) prompt ra đề buộc đáp án nhất quán với thuật toán chuẩn (đáp án duy nhất hoặc "in bất kỳ đáp án đúng"), không đặt luật chọn mà thuật toán không tự cho ra; (3) `keyAndTrim` lấy màu nền thật từ viền ảnh, nếu là xanh lá thì xoá vùng gần màu đó liên thông với viền (bắt được nền xanh lệch #00FF00); (4) action `same` để nhiều key cùng thực thể dùng chung một asset; (5) `SceneAssetItem.aspect` (từ kích thước biến thể) để `StoryScene` vẽ đạo cụ dạng ngang đúng tỉ lệ.

## 7. Xử lý lỗi

- Router/mạng lỗi: runner thử lại; nội dung sai sau vòng sửa: `PermanentJobError` kèm lý do hiển thị ở UI.
- Resolve không trả đủ request: phần thiếu để `open`.
- Job sinh ảnh `failed`: request `failed`, người dùng thử lại (hành vi hiện có).
- Revision bị thay giữa chừng (stale): dùng cơ chế `stale` hiện có.

## 8. Biến môi trường, docs

Không thêm biến môi trường. Cập nhật `CLAUDE.md` (mục kiến trúc) và `docs/standards` nếu đổi bảng `allowedStates`.

## 9. Kiểm chứng

Không viết và không chạy test (AGENTS.md luật 4 đến 6). Xác minh bằng `npx tsc --noEmit`, `npm run lint`, `npm run build`, và chạy tay trên app: nhập chủ đề, đọc truyện/đề, sinh lời giải (không code), sinh kịch bản, xem gán asset tự động, duyệt ảnh. Việc sinh ảnh seed cần 9router chạy.

## 10. Rủi ro và việc cần xác nhận trong plan

- Worktree đang có nhiều thay đổi chưa commit ở `src/lib/db/schema.ts`, `package.json` và nhiều file khác: plan phải đọc lại trạng thái thực tế trước khi sửa.
- Model ảnh có thể không giữ phong cách pixel art đồng nhất; chấp nhận, user duyệt từng ảnh và có thể từ chối để sinh lại.
- Các mẫu "không code" có thể chặn nhầm mã giả/ngôn ngữ tự nhiên chứa `;`: giới hạn ở dòng giống code C và đo lại khi chạy tay.
