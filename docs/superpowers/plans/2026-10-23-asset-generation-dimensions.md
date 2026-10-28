# Plan — preset dimension trước khi tạo asset

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans để thực hiện inline theo từng task. Luật AGENTS về test thắng hướng dẫn TDD; không viết/chạy test files.

**Status:** APPROVED trong chat 2026-10-23 cùng bổ sung ánh xạ Antigravity; đã triển khai trên nhánh feat/asset-generation-dimensions; kết quả và giới hạn trong docs/DangLee_ImplePlan/ASSET_GENERATION_DIMENSIONS_REPORT.md. Smoke Boston vẫn PAUSED và không tự resume khi tính năng hoàn thành.

**Bổ sung đã duyệt:** runtime router báo0.5.104; requested preset giữ nguyên trong DB/UI/prompt. Client map riêng prefix ag/antigravity:1920x1080→wire1792x1024,1080x1920→wire1024x1792, các preset khác giữ nguyên; model_default không gửi size. Ghi transportSize trong metrics. Không đổi model/provider/router hoặc hứa native resolution. [Báo cáo provider](../../DangLee_ImplePlan/IMAGE_PROVIDER_DIMENSION_INVESTIGATION.md).

**Spec:** `docs/superpowers/specs/2026-10-23-asset-generation-dimensions-design.md`.

**Goal:** Chọn kích thước yêu cầu trên form tạo asset pipeline gốc, dùng lại cho các biến thể, minh bạch requested/source/processed dimensions.

**Architecture:** UI/action/worker dùng một allowlist. Preset lưu bất biến trên asset, worker truyền requested size cho client 9router; client áp ánh xạ transport Antigravity nêu trên. Ảnh thực vẫn qua xử lý cũ, source canvas được lưu riêng với PNG sau trim. Không có resize hậu kỳ hoặc sửa Remotion/Scene DSL.

**Tech stack đã đọc từ lockfile/Dockerfile:** Next15.5.28, React19.1.0, Remotion4.0.537, Sharp0.35.5, Zod4.6.7, Drizzle ORM0.45.4/kit0.31.11, Supabase CLI2.121.0, Node22 Docker. Không nâng dependency.

## Ràng buộc và phương án

- Chọn **gửi preset vào native image request, giữ pipeline xử lý ảnh cũ**. Không chọn phương án chỉ ghi size trong prompt vì provider có thể không hiểu; không chọn resize/pad hậu kỳ vì có thể làm khác bố cục/tỷ lệ sprite và giả native resolution.
- Default model +5 preset trong spec; default NULL để tương thích. Preset bất biến sau tạo asset ở V1; variants/retries kế thừa DB.
- Chỉ sau approval chuẩn bị branch `feat/asset-generation-dimensions` từ workspace hiện tại. Vì Step A + baseline chưa commit, nếu dùng worktree mới phải snapshot manifest SHA256 và carry chính xác thay đổi cần thiết, env copy riêng không in nội dung; worktree mới không tự kế thừa dirty files. Dùng data junction/override về nguồn hiện tại, không copy data/vendor/runtime hoặc reset DB. Không stash/reset/merge/push/commit tự động.
- Không viết/sửa/chạy test, fixtures/mocks; kiểm chứng bằng lint/typecheck/build và vận hành asset thật. Không gọi model hoặc đổi DB trong giai đoạn plan.
- Pipeline A/ComfyUI đã đóng; không áp gate GPU cũ, không cần PC AMD cho tính năng này.
- Không thay Scene DSL v1 hoặc chỉnh kích thước sprite/video trong Remotion.

## Interfaces dùng chung

Tạo `src/lib/assets/generation-size.ts` làm nguồn duy nhất:

- `ASSET_GENERATION_SIZES`: readonly entries của5 preset, mỗi entry có `value`, `width`, `height`, `aspectLabel`, `label`.
- `AssetGenerationSize`: union `'1024x1024'|'1920x1080'|'1080x1920'|'1536x1024'|'1024x1536'`.
- `parseGenerationSize(input:unknown): AssetGenerationSize|null`: thiếu/null/chuỗi rỗng/`model_default`→NULL; giá trị preset hợp lệ→union; còn lại ném lỗi validation có thông báo tiếng Việt. Tầng action trả FormState.error, worker chuyển lỗi thành PermanentJobError.
- `generationSizeInfo(size:AssetGenerationSize): {width:number;height:number;aspectLabel:string}` tra từ constant; không parse/ghép width-height tự do từ browser.

`generateImage(input:{model:string;prompt:string;size?:string;timeoutMs?:number}):Promise<GeneratedImage>` thêm optional size; low-level nhận string vì là client9router dùng chung, caller asset phải validate union trước.

`src/lib/ninerouter/image-size.ts`: `imageTransportSize(model:string,requestedSize?:string):string|undefined`. GeneratedImage bổ sung transportSize:string|null; metrics.image ghi requestedSize và transportSize riêng. Không đổi preset DB theo transport alias.

`imagePrompt(kind,description,state,feedback?,generationSize?:AssetGenerationSize|null):string` thêm lựa chọn canvas; NULL phải cho cùng prompt như phiên bản cũ.

DB3 cột/check như spec; job base thêm optional `generationSize`. Kết quả renderVariant bổ sung `requestedSize`, `sourceWidth`, `sourceHeight`, `sizeMismatch` (null khi không yêu cầu), giữ `width/height` đã có làm kích thước PNG; caller generateBase/generateVariant vẫn trả object `image` để runner lưu metrics như hiện tại.

`ImageGenerationRequestError` có `status:number` và message an toàn; không đưa raw provider response/Authorization vào log/UI. Worker chỉ chuyển lỗi HTTP400/422 của image request thành PermanentJobError, không đổi hành vi chat/queue khác.

## Task0 — snapshot, capability và điểm bắt đầu an toàn

**Files:** đọc package/lock/Dockerfile, image client/worker/form/schema và drizzle/meta; ghi ledger/report dưới `.superpowers/sdd/2026-10-23-asset-generation-dimensions/`, không sửa smoke runner/manifest.

**Interfaces:** consume checkpoint Boston và repo thực tế; produce source/version/provider capability note + snapshot manifest + baseline counts/history cho Task1.

- [x] Đọc spec + plan đầy đủ và checkpoint smoke; giữ control PAUSED. Inventory đã ghi 6 asset/10 file với trạng thái/hash ở checkpoint; không dùng pending_review như approved.
- [x] Xác nhận branch/worktree và carry baseline theo ràng buộc trên; kiểm SHA256, env riêng, data source và dependency lock. Không làm mất Step A Remotion chưa commit.
- [x] Đối chiếu nguồn chính thống qua Context7 trước, official source sau nếu thiếu. Xác minh read-only router version/provider mapping của `ag/gemini-3.1-flash-image` nếu deployment cung cấp; GET models/info chỉ có textToImage không chứng minh hỗ trợ size.
- [x] Đối chiếu aliasag=Antigravity, release0.5.104 sizeToAspectRatio; user duyệt transport mapping2preset ngang/dọc. Không tự thêm aspect_ratio/imageConfig hoặc đổi model/router. Chưa gọi generation ở Task0.
- [x] Xác nhận implementation option không bảo đảm native1920×1080 hoặc mở được smoke16:9. Nếu mục tiêu trở thành bắt buộc model trả đúng size bằng adapter riêng, dừng scope đó để lập bổ sung; không đánh đồng với feature hiện tại.

**Verification:** version/source note và manifest đủ, no model/DB write, không thay trạng thái pause. Capability note phân biệt documented upstream / observed deployment / unknown.

## Task1 — contract kích thước và migration additive

**Files:** Create generation-size.ts; Modify src/lib/db/schema.ts; Generate drizzle/0003_* và meta snapshot/journal tương ứng. Kiểm lại thứ tự trước generate; không đổi file migration cũ.

**Interfaces:** consume Task0 snapshot/history và preset contract; produce 3 nullable columns/2 checks + `AssetGenerationSize`, `parseGenerationSize`, `generationSizeInfo` cho Tasks2–4.

- [x] Chốt allowlist/helper đúng interface trên; không thêm custom numeric dimensions.
- [x] Thêm assets.generationSize nullable text + assets_generation_size_allowed; variants.sourceWidth/sourceHeight nullable integers + asset_variants_source_size_valid yêu cầu cả NULL hoặc cả>0/NOT NULL.
- [x] Xác nhận meta0000/0001/0002 hiện có khớp journal, generate bằng drizzle-kit pin hiện tại; xem diff SQL chỉ có3 ADD COLUMN và2 CHECK. Nếu phát sinh drop/recreate/đổi field khác thì dừng chẩn đoán metadata, không áp.
- [x] Backup DB local trước apply; xác nhận endpoint local cartoon-local, history và số lượng assets/variants/series/videos trước/sau. Chỉ áp migration mới lên local đã có0000–0002; không chạy reset hoặc áp0002 vào DB cũ ngoài scope. Old rows generation_size/source dimensions NULL; status/file/path/name không thay đổi.
- [x] Chuyển phiên bản có phối hợp: đợi asset jobs đang chạy xong, tạm dừng nhận job qua app/worker; backup rồi migration, chạy cùng bản app/worker mới trước mở nhận payload preset. Kiểm lại queue/job IDs cũ không mất. Không dừng/reset Supabase hoặc service project khác; không để worker cũ tiêu thụ job mới.

**Verification:** schema/SQL diff, metadata catalog đọc-only xác nhận3 cột/2 checks và history thêm đúng một entry, counts dữ liệu cũ giữ nguyên. Không migration cloud.

## Task2 — form chọn preset và lưu vào asset

**Files:** Modify src/components/assets/create-asset-form.tsx, src/app/series/asset-actions.ts, src/worker/asset-jobs.ts.

**Interfaces:** consume Task1 preset helper/DB fields; produce validated base payload và DB-owned preset truyền cho renderVariant.

- [x] Form thêm select generationSize với label/copy/default từ spec, dùng chung constants; giữ selection khi action trả lỗi, disable khi pending theo pattern hiện tại.
- [x] createAsset parse server-side trước enqueue; payload generationSize union/null. Sai preset không tạo queue job hoặc record asset.
- [x] generateBase validate payload độc lập. Khi tạo record assets lần đầu, lưu generationSize. Khi asset đã tồn tại (retry), lấy preset DB, không ghi đè theo payload cũ; field thiếu ở old job→NULL chỉ khi tạo record mới.
- [x] generateVariant và renderVariant đọc asset.generationSize từ record đã load cho mọi state; requestVariant/rejectVariant/retryVariant không nhận override từ browser. Không thêm option riêng cho variant ở V1.

**Verification:** lint/typecheck; kiểm chứng vận hành form model_default/preset hợp lệ và việc giá trị còn sau validation lỗi; đọc record/job có requestedSize đúng. Không cố tình gọi model để kiểm tra input sai.

## Task3 — truyền request size, prompt và metadata thực

**Files:** Create src/lib/ninerouter/image-size.ts; Modify src/lib/ninerouter/client.ts, src/lib/assets/prompts.ts, src/worker/asset-jobs.ts. Đọc source metadata bằng Sharp trong worker; image.ts giữ nguyên.

**Interfaces:** consume preset từ asset DB qua Task2; produce typed safe HTTP error, raw source dimensions, processed dimensions và metrics fields đúng contract.

- [x] generateImage chỉ thêm JSON size khi được caller truyền, áp mappingag/antigravity đã duyệt; provider khác pass-through. Giữ binary endpoint, model và sniff MIME.
- [x] imagePrompt: NULL giữ output cũ; chọn preset thì background aspect theo entry thay fixed16:9, các kind khác giữ framing/green screen và thêm canvas hint. Không đổi AssetProposal/LLM mô tả trait.
- [x] Dùng Sharp đọc source width/height thực từ buffer model trả trước key/trim/PNG. Kiểm positive/defined; ảnh invalid không được ghi metadata giả. Lưu sourceWidth/sourceHeight cùng filePath,width,height,status sau xử lý thành công.
- [x] Upsert bắt đầu lượt sinh reset sourceWidth/sourceHeight cùng NULL; chỉ ghi cặp mới sau xử lý thành công. Không trình bày source của lượt trước như ảnh mới, không đổi filePath/width/height tại bước start. Sharp metadata đo kích thước encoded input, không tự áp autoOrient/resize như một thay đổi mới.
- [x] Metrics `image` thêm requestedSize/transportSize/sourceWidth/sourceHeight/sizeMismatch; mismatch so nguồn raw với requested preset, không so wire alias hoặc PNG sau trim. Không resize/crop/pad hậu kỳ mới, không thêm vòng gọi lại khi mismatch200.
- [x] Thêm typed ImageGenerationRequestError chứa status trong client để asset worker chuyển400/422 thành PermanentJobError. Thông báo không khẳng định size là nguyên nhân nếu provider không nói vậy; không log key/endpoint/raw ảnh. Giữ cơ chế retry lỗi mạng/429/5xx; không sửa retry của job khác.

**Verification:** typecheck/build; request thực đại diện được phê duyệt sau implementation có size đúng; metadata source/PNG và metrics khớp file thật. Nếu provider từ chối size hoặc trả size khác thì ghi đúng kết quả, không suy ra mọi preset đều hỗ trợ. Không tạo mock transport/test file hoặc cố ý gửi request upstream lỗi.

## Task4 — hiển thị yêu cầu, ảnh nguồn và ảnh sau xử lý

**Files:** Modify src/app/series/[seriesId]/assets/[assetId]/page.tsx; tận dụng type/query hiện có trong src/lib/assets/queries.ts nếu cần.

**Interfaces:** consume assets.generationSize + variants.sourceWidth/sourceHeight/width/height/status; produce requested/source/PNG labels + mismatch warning bằng metadata mới, không dựa vào trim.

- [x] Hiện preset của asset là “Mặc định model” hoặc W×H; không có nút đổi sau tạo ở V1.
- [x] Variant card hiện source dimensions khi có và PNG width/height hiện có. Legacy sourceNULL hiển thị chưa ghi nhận; không backfill/so mismatch từ PNG.
- [x] Hiện warning khi source thực khác preset đã chọn; ảnh vẫn đi qua pending_review bình thường. Trạng thái đang sinh/lỗi không hiển thị source mới giả định.
- [x] Giữ catalog/ResolvedAssets/SceneView dùng PNG width/height và path thật. Không thay cách phóng sprite trong cảnh hoặc kích thước composition.

**Verification:** xem giao diện asset cũ/mới, chr trim và background; ảnh preview đúng tỷ lệ, warning không bị kích hoạt chỉ vì keyAndTrim. Jobs hiện metrics mới qua UI JSON metrics hiện có, không cần trang mới.

## Task5 — kiểm chứng tích hợp và bàn giao

**Files:** Update README.md phần asset khi thực hiện, chỉ hunk liên quan; không gộp các thay đổi Docker có sẵn.

**Interfaces:** consume UI/pipeline của Tasks1–4; produce verification report + limitation note, smoke vẫn PAUSED.

- [x] `npm run lint`, `npx tsc --noEmit`, build app/worker Docker theo cấu hình local hiện có; không chạy file *.test.*/*.spec.*.
- [x] Phạm vi manual verification đề xuất khi duyệt plan: series local riêng `DIMENSIONS — 2026-10-23`; tối đa 3 job generation ban đầu gồm prop base1024×1024, bg base1920×1080 và một variant broken của prop sau khi base được xem/duyệt. Chỉ approve ảnh thuộc series này bằng review có provenance agent; không approve dữ liệu cũ. Dùng queue thật, không mock/stub/test file. Không cố ý tạo upstream400/422 để thử lỗi; worker giữ tối đa3attempt theo cơ chế sẵn có. Không thêm feedback/regeneration ngoài3job này. Nếu provider báo không hỗ trợ size thì dừng các lượt còn lại, ghi lỗi thật; mismatch200 ghi warning và không tự sửa.
- [x] Với3job trên, đối chiếu preset ở form/DB/payload/request bằng log an toàn chỉ model+size (không key/prompt/response raw), metadata nguồn/PNG thực và metrics; variant kế thừa preset không cần nhập lại. Form giữ lựa chọn khi validation khác trả lỗi; input preset không hợp lệ bị chặn trước enqueue, không gọi model cho dữ liệu sai.
- [x] Kiểm tra asset/job legacy thiếu preset qua code/DB read-only và asset page nguồn NULL, không tạo variant mới trên asset cũ. Đọc scene/render preview hiện có với kích thước PNG thật; không re-render video hoặc thay asset cũ. Nếu cần vận hành model_default/legacy thật thì là lượt ngoài3job này, phải được người dùng yêu cầu thêm.
- [x] Báo rõ preset được yêu cầu và kích thước model thực trả; không gọi hậu xử lý là native1920×1080. Tài liệu nêu lựa chọn chỉ có trước tạo asset và biến thể kế thừa.

**Verification:** ghi kết quả lint/typecheck/build và job IDs/kích thước thực của những lượt vận hành đã chạy; nêu capability chưa xác minh, không tuyên bố ảnh sinh đúng mọi preset.

Không có formal test suite mới. Approval implementation bao gồm migration local, phạm vi manual verification3job và ánh xạ transport Antigravity đã duyệt; không bao gồm resume smoke Boston, migration cloud, sửa router hoặc adapter provider khác.

## Review Focus / tự rà soát

1. Model bỏ qua size: Task3 đo nguồn thực, Task4 warning; không silent-resize hoặc lặp generation.
2. Retry/variant rơi về default hoặc lấy PNG trim làm size: Task2 dùng DB source-of-truth, Task3 truyền đúng từ asset.
3. Background prompt vẫn wide16:9 khi chọn vuông/dọc: Task3 aspect từ constant; NULL giữ hành vi cũ.
4. Legacy job/asset không có fields mới: Tasks1–2 NULL-compatible, Task4 không tạo warning giả.
5. Migration đụng dữ liệu hoặc metadata ngoài scope: Task1 diff/backup/history/counts, không reset/replay SQL cũ.

Spec coverage: scope/presets→Tasks1–2; native request/prompt/source dimensions→Task3; UX/metadata→Task4; regression/manual operations/docs→Task5. Mọi task dùng cùng union/helpers và3 cột được chốt trong spec. Authorization triển khai và bổ sung transport mapping được user duyệt trong chat.

Builder check độc lập2026-10-23: “Nothing important left.” Reviewer không thấy câu hỏi hoặc mâu thuẫn quan trọng còn buộc builder đoán sai scope. Review chỉ đọc tài liệu/source; không thay thế approval của user.

Builder check bản cập nhật r2 sau smoke: “Nothing important left.” Reviewer xác nhận capability caveat, checkpoint/pause, source metadata, chuyển phiên bản app/worker và phạm vi3job nhất quán với source. Spec/plan vẫn chờ approval; không có code/migration/generation dimension được thực hiện trong giai đoạn này.
