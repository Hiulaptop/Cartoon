# Video giảng thuật toán — Implementation Plan

> **Trạng thái: đang thực hiện theo chỉ thị tiếp tục của user ngày 2026-10-23.** Spec đã được duyệt. Lát 0 còn các giới hạn ghi bên dưới; Lát 1 đã triển khai và apply migration. Lát 2 đang triển khai dở; migration bổ sung 0006–0008 đã apply. Luồng tạo lời giải LLM, chờ duyệt và từ chối kèm góp ý đã nối vào worker; chưa gọi LLM thật.

**Mục tiêu:** Thêm nhánh video giảng thuật toán revisioned, có cổng người duyệt và tách khỏi pipeline hoạt hình; tái sử dụng series/assets, pgmq, worker và Remotion nhưng không đổi nghĩa dữ liệu cũ.

**Spec đã duyệt:** `docs/superpowers/specs/2026-10-23-algorithm-video-design.md`

**Repo tại thời điểm lập plan:** Next.js 15.5.28, React 19.1.0, TS 5.9.3, Drizzle ORM/Kit 0.45.4/0.31.11, LangGraph 1.5.1, checkpoint-postgres 1.1.0, Zod 4.6.7, Remotion 4.0.537; worker Node 22 Debian, app Node 22 Alpine. Nguồn: `package.json`, `package-lock.json`, `Dockerfile`.

## Ràng buộc làm việc

- Không tạo hoặc chạy test; chưa có runner. Chỉ chạy lint, `npx tsc --noEmit`, build khi cần xác minh và được phép.
- Không áp migration lên DB thật mà chưa có chỉ thị riêng. Sinh migration, kiểm SQL và review diff là phần triển khai sau duyệt plan.
- Không dùng `git add -A`, không commit/push nếu chưa được yêu cầu.
- Mỗi lát giữ app compile được; không để handler hoạt hình chạy nhầm loại algorithm.
- Không thêm crawler, online judge, upload YouTube, hay thực thi code tự do.
- TTS chỉ được tích hợp sau khi nhà cung cấp/model, chi phí, dữ liệu audio và cách xử lý tốc độ/retry được chốt trong plan triển khai riêng; không gọi dịch vụ khi chỉ đang cập nhật tài liệu.
- LLM-generated content, đề, source, feedback và playbook là input không tin cậy; không đưa secret vào prompt/log.

## Kiến trúc bắt buộc theo spec

- Design vẫn là `videos`, thêm `kind`; hoạt hình hiện hữu được backfill `cartoon`. Algorithm có state riêng, không dùng `video_status` hoạt hình.
- Các bảng nội dung nghiệp vụ mới có version/input lineage; revision immutable, quyết định gắn đúng revision/fingerprint.
- Duyệt lưu DB; job chạy ngắn. LangGraph interrupt chỉ cho vòng lời giải, dùng cùng thread ID/checkpointer, chờ người duyệt không giữ worker lock.
- Renderer animation chỉ nhận `AlgorithmAnimationV1` khai báo; tuyệt đối không `eval`/chạy TSX do LLM sinh.
- Tái dùng asset đã duyệt đúng series; yêu cầu asset algorithm không đi qua casting pipeline cũ.
- Mọi downstream gate được kiểm ở server action và worker, không chỉ UI.

## Lát 0 — Spike kỹ thuật và chốt contract thực thi — **hoàn tất một phần**

**Files:** `docs/superpowers/spikes/2026-10-23-algorithm-video.md`, `scripts/spikes/algorithm-video/`; không thay đổi runtime app.

1. Đã đối chiếu API LangGraph JS interrupts với version 1.5.1; prototype dùng `MemorySaver` xác nhận interrupt/resume cùng `thread_id`. PostgresSaver chưa spike: setup có side effect DB, `.env` không xác nhận database spike an toàn; chưa kiểm chứng transaction/outbox, crash/duplicate resume.
2. Đã render composition dọc Remotion 4.0.537 có array, SVG graph và text tiếng Việt; ffprobe xác nhận H.264 1080×1920, 30 fps, 3 giây. Chưa xác minh Player trong-app parity/layout bằng mắt; dành cho lát 6.
3. Contract schema chi tiết, Unicode counting, safe bounds và taxonomy IDs chưa khóa; giữ lại cho các lát implement, không tự đặt giới hạn không đo.
4. Spec architecture không cần đổi dựa trên kết quả hiện có; không gọi LLM, không kết nối DB, không tạo/chạy test.

**Xác minh:** script spike độc lập đã chạy; metadata output đã kiểm tra; `git diff --check` sạch. Nguồn chính thức và giới hạn xem `docs/superpowers/spikes/2026-10-23-algorithm-video.md`. Các phần persistence Postgres chưa được xác minh; không coi đó là điều kiện đã đạt khi triển khai các lát sau.

## Lát 1 — Schema nền, discriminator và bảo toàn pipeline hoạt hình — đã triển khai và apply migration

**Files dự kiến:**
- `src/lib/db/schema.ts`
- `drizzle/<migration>.sql`, `drizzle/meta/*` (do generate; review kỹ snapshot)
- `src/lib/video/queries.ts`
- `src/lib/project/tree.ts`, `src/lib/project/queries.ts`
- `src/app/projects/[id]/new-design/page.tsx`
- `src/components/videos/create-video-form.tsx`
- `src/app/designs/actions.ts`
- `src/app/page.tsx`
- `src/app/projects/[id]/page.tsx`
- `src/app/designs/[id]/layout.tsx`, `src/components/designs/design-tabs.tsx`
- handlers/actions hiện tại cần có guard `kind=cartoon`: `src/app/designs/actions.ts`, `src/worker/casting-jobs.ts`, `src/worker/script-jobs.ts`, `src/worker/scene-jobs.ts`, `src/worker/render-jobs.ts`, `src/worker/upload-jobs.ts`.

1. Thêm `video_kind` (`cartoon`, `algorithm`) và cột `videos.kind`; backfill tất cả record cũ `cartoon`, sau đó `NOT NULL DEFAULT 'cartoon'`.
2. Thay đổi nullability `videos.status` và check constraint: `cartoon` yêu cầu status hợp lệ; `algorithm` yêu cầu status NULL. Insert cũ vẫn tạo cartoon nhờ default; không dùng giá trị enum mới trong cùng migration transaction.
3. Tạo bảng `algorithm_workflows`, `algorithm_revisions`, `algorithm_revision_inputs`, `algorithm_decisions`, `algorithm_asset_requests`, `algorithm_outputs`, `playbook_lessons`, `playbook_lesson_sources`, `generation_playbook_snapshots`, `algorithm_generation_runs` như spec §12; thêm enums/check/index/FK. Dùng các FK tổng hợp hoặc ràng buộc transaction cần thiết để không liên kết revision khác video; kiểm tra thứ tự migration, unique version và append-only policy.
4. Giữ quyết định algorithm trong `algorithm_decisions` (một nguồn sự thật); không đồng thời tạo bản ghi `reviews` polymorphic cho cùng quyết định.
5. Cập nhật row/tree summaries để mang `kind` và status phù hợp; summary hoạt hình không đếm algorithm status NULL thành trạng thái giả hoặc làm mất design algorithm.
6. Tạo lựa chọn loại video đầu tiên trong form; tạo algorithm draft chỉ insert video+workflow+input revision transactionally, không gọi `ensureDefaultCombo`/`casting.propose`. Form cartoon giữ behavior cũ.
7. Bộ phim algorithm không cần đủ nhân vật+bối cảnh đã duyệt; chọn series tồn tại và không ép asset ngay khi tạo draft.
8. Thêm `getAlgorithmWorkflow(videoId)`/query revision có kind gate; update tree/home/project labels cho loại và stage tương ứng.

**Migration:** `npx drizzle-kit generate --name algorithm_video_foundation`; kiểm generated SQL/backfill/check/constraint order/snapshot. Không chạy `db:migrate` trong plan này.

**Kết quả ngày 2026-10-23:** thêm discriminator/status constraint và 10 bảng nghiệp vụ; draft algorithm tạo video + problem revision + workflow trong transaction, không enqueue casting/LLM. Form chọn loại trước, series algorithm không cần chr/bg. Trang draft đọc riêng, layout/list/tree phân loại; query/action/worker cartoon có kind gate. `0004_algorithm_video_foundation.sql` sinh offline; sửa thứ tự unique key videos trước FK. `0005_algorithm_video_invariants.sql` là custom migration cho append-only/immutable snapshots, pointer stage/approval, series binding và cartoon-only content guards (trigger không nằm trong Drizzle snapshot).

**Xác minh:** `npx tsc --noEmit`, `npm run lint` đạt. Build đầu thất bại do circular type inference; đã thêm return type callback Drizzle và `npm run build` chạy lại đạt. Không chạy test, không kết nối/apply DB, chưa xác minh trigger SQL hoặc UI trên database. Cần apply cả 0004 và 0005 trước khi chạy code mới; chưa deploy/commit/push. Lát 2 chưa bắt đầu.

**Chạy app theo yêu cầu riêng của user:** `npm run db:migrate` thành công (3917 ms), bao gồm migration đang chờ 0004/0005. Dev server `npm run dev -- --port 3002` ready; GET `/projects` và trang tạo design của project hiện có trả HTTP 200; HTML có lựa chọn Hoạt hình/Giảng thuật toán. Browser preview không mở được vì lỗi ownership của công cụ, nên chưa kiểm tương tác trình duyệt hoặc submit form, chưa tạo dữ liệu thử và chưa xác minh từng trigger. Không chạy test suite. Không bật worker vì draft algorithm hiện không enqueue job. Cổng 3000/3001 đang bị chiếm, không dừng tiến trình đó. Lát 2 chưa bắt đầu.

**Nguồn chính thức:** https://orm.drizzle.team/docs/indexes-constraints ; https://orm.drizzle.team/docs/drizzle-kit-generate ; https://nextjs.org/docs/app/guides/forms ; https://www.postgresql.org/docs/current/plpgsql-trigger.html . Context7/superpowers/understand-anything không được expose trong phiên; không tuyên bố đã dùng chúng.

## Lát 2 — Draft đề bài/lời giải thủ công và lịch sử revision

**Files dự kiến:**
- `src/lib/algorithm/{contracts,queries,revision,dependencies}.ts`
- `src/app/algorithm/actions.ts`
- `src/app/projects/[id]/new-design/page.tsx`, `src/components/videos/create-video-form.tsx`
- `src/app/designs/[id]/algorithm/...`
- `src/components/algorithm/*`

1. Định nghĩa versioned Zod contracts và shared validation app/worker; giới hạn payload/trường, enum values; không dùng heuristic regex làm semantic validation.
2. Insert algorithm video + workflow + problem revision trong transaction; không insert cartoon `scripts` hoặc `combos`. Draft cho phép đề trống/nháp, nhưng stage gate chặn tiến tiếp khi thiếu dữ liệu.
3. Server actions sửa đề/lời giải tạo revision bất biến; lời giải nhập tay mang `source=human` và cần explicit approve.
4. Query lịch sử theo revision IDs và input edges; quyết định append-only, reject reason bắt buộc. Action kiểm kind, active revision, state và expected fingerprint; transaction lưu decision + pointer + job kế tiếp.
5. Đổi problem đánh dấu downstream stale, không sửa/xóa history; sửa revision cũ không được chuyển active pointer lùi.
6. Tạo stage navigation theo `kind`; cartoon tab/order/route behavior giữ nguyên.

**Kết quả hiện có:** strict Zod contracts cho đề/lời giải; actions tạo draft, sửa đề, nhập lời giải thủ công và duyệt/từ chối; concurrency CAS, fingerprint và dependency edge. Có trang lịch sử revision. Nút LLM đề xuất tạo `generation_run` + revision `generating` + job pgmq trong cùng transaction. Worker gọi 9router theo yêu cầu, parse strict JSON, lưu provenance/metrics và chuyển revision hợp lệ sang `pending_review`; job stale bị ngăn chiếm active pointer. Nút “Từ chối và yêu cầu LLM sửa” ghi lý do và enqueue lại trong cùng transaction; prompt nhận feedback như dữ liệu không tin cậy. Worker gia hạn visibility lock. UI tự refresh khi đang sinh; nhập tay vẫn có nhưng là tùy chọn.

**Còn thiếu/giới hạn:** Lát 2 chưa hoàn tất end-to-end. Chưa chạy LLM thật vì có thể tốn phí; chưa xác minh vòng job→review bằng lần gọi thật. `algorithm_decisions` có unique revision ID; mỗi lần từ chối dùng revision riêng rồi tạo revision mới. Luồng form nhập tay vẫn còn phải rà kỹ lịch sử nhiều lần submit. Stale downstream ngoài solution accepted khi duyệt problem mới chưa được xét đầy đủ. SQL trigger 0005 chưa được kiểm chứng trên tất cả luồng app.

**Migration bổ sung:** `0006_algorithm_revision_stage_link.sql`, `0007_algorithm_stale_status.sql`, `0008_algorithm_solution_job.sql` đã apply. 0006 ban đầu bị lỗi do FK đứng trước UNIQUE; sửa thứ tự và apply thành công. 0008 thêm `target_type.algorithm_workflow`; lần chạy đầu báo enum value đã tồn tại (đã có từ migration 0004), nên đổi thành `ADD VALUE IF NOT EXISTS` theo tài liệu PostgreSQL và chạy thành công. Nguồn cú pháp: https://www.postgresql.org/docs/current/sql-altertype.html .

**Xác minh:** `npx tsc --noEmit`, lint và build đều đạt sau khi thêm LLM flow. Trang design hiện hữu trả HTTP 200 và hiển thị nút LLM/duyệt; chưa bấm gọi model thật (chi phí), chưa xử lý kết quả worker live, chưa xác minh DB trigger với submit/duyệt. Hai dev server chạy chồng đã cùng ghi `.next`, gây ENOENT/500; đã dừng cả hai server do phiên này khởi chạy. Các tiến trình worker cũng đã dừng; không có job lời giải nào được enqueue. Cổng 3000/3001 thuộc tiến trình khác, không dừng. Không chạy test suite. Dừng trước Lát 3.

## Lát 3 — Durable solution graph, resume và playbook

**Files dự kiến:**
- `src/lib/algorithm/solution/{schema,prompts,check,graph}.ts`
- `src/lib/algorithm/playbook/{schema,queries,selection}.ts`
- `src/worker/algorithm-solution-jobs.ts`
- `src/worker/handlers.ts`, `src/lib/queue/jobs.ts`
- `src/app/designs/[id]/algorithm/solution/*`, `src/app/algorithm/actions.ts`
- checkpoint setup service/file hiện có, sau khi xác định qua spike

1. `solution.generate` nhận generationRun ID, immutable input revision IDs và playbook snapshot; tạo generation row trước enqueue.
2. Graph node tách riêng: load → LLM write → deterministic checks → optional advisory critique → bounded machine repair → persist candidate → interrupt người duyệt. Prompt đánh dấu đề/code/feedback là dữ liệu không tin cậy.
3. Action quyết định lưu approve/reject và outbox/queue resume trong transaction; resume cùng durable `thread_id`; chặn duplicate/stale response; có reconciliation khi DB và checkpoint lệch trạng thái.
4. Reject bắt buộc reason, tạo candidate revision mới, dùng feedback cục bộ trong workflow; không auto-approve lesson. Tối đa 2 vòng sửa máy mỗi yêu cầu; reject của người dùng bắt đầu chu kỳ mới.
5. Lưu provenance model/prompt/contract/input/playbook snapshot và metrics; lọc secret, giới hạn lỗi lưu.
6. Lesson `proposed` không được đưa vào prompt; duyệt tạo immutable version, retire chặn lần dùng mới. Snapshot truy vấn tất định theo stage/tags/scope.
7. Handler kết thúc sau khi lưu “waiting for review”; không giữ queue lock trong lúc chờ.

**Xác minh:** typecheck/lint/build; thực hiện spike tách biệt và inspect trạng thái resume thủ công; không tạo/chạy test.

## Lát 4 — Combo AI, taxonomy và chọn tay

**Files dự kiến:** `src/lib/algorithm/combo/*`, `src/worker/algorithm-combo-jobs.ts`, queue/handler registry, actions và UI combo.

1. Taxonomy versioned với stable IDs và nhãn Việt cho 9 thành phần trong spec §6.
2. Proposal tiêu thụ revision đề/lời giải đã duyệt và snapshot playbook; lưu candidate/provenance.
3. Approve kiểm trường bắt buộc, taxonomy và ngân sách thời lượng; lưu decision rồi mở stage script.
4. Reject(reason) mở editor chọn tay điền sẵn; submit lưu revision nguồn human, diff và liên kết lý do. Không bắt buộc gọi LLM lại.
5. Validate tính nhất quán giữa thành phần; mục tùy chọn bỏ được nhưng cần rationale.
6. Có thể đề xuất lesson từ diff chọn tay nhưng chỉ dùng sau khi duyệt riêng.

**Xác minh:** typecheck/lint/build; inspect UI và revision lineage thủ công, không test.

## Lát 5 — Script, asset requests và duyệt script cuối

**Files dự kiến:** `src/lib/algorithm/script/*`, `src/worker/algorithm-script-jobs.ts`, actions/UI script + assets, asset request queries/review, approved asset queries hiện tại.

1. Sinh `AlgorithmScriptV1` chỉ từ đề/lời giải/combo đã duyệt; cảnh/cue/code/data/action có ID ổn định và input edges.
2. UI hai cột lời nói/phụ đề và hình ảnh/thao tác; chỉnh sửa tạo revision mới; narrator khác character asset.
3. Tra asset bằng `loadApprovedCatalog(seriesId)`; tạo request algorithm-specific với temporary key, decision/reason/binding.
4. Chỉ nối request tới image jobs hiện có qua API dùng chung rõ ràng; không insert `asset_proposals` và không kích hoạt casting gate hoạt hình. Asset mới phải tuân chuẩn tên và thuộc đúng series trước khi gọi job ảnh.
5. Request lifecycle open → generating/review → approved/bound hoặc dropped; regenerate cần reason và idempotent; xử lý xung đột unique name có thông báo.
6. Duyệt script cuối chỉ khi mọi request resolved, mọi binding đúng series/đã duyệt, cue/subtitle hợp lệ, duration nằm giới hạn; quyết định gắn script revision + manifest fingerprint.
7. Sửa script làm downstream stale; asset được tái sử dụng chỉ sau khi manifest mới được xác nhận.

**Xác minh:** typecheck/lint/build; rà naming/query paths; không test.

## Lát 6 — Animation JSON, preview, renderer và review video

**Cập nhật theo art direction đã được duyệt ngày 2026-10-24:** nền kem sáng và chữ tương phản cao; semantic palette cam/vàng/xanh/đỏ; animation biểu diễn từng thao tác giải thuật bằng timeline có nhịp; subtitle nằm trong safe area. Voiceover mục tiêu là TTS tiếng Việt trung tính, không clone giọng, mặc định 1,25× và điều chỉnh 1,0×–1,5×. Nhà cung cấp TTS, chi phí, audio storage, speed control và retry policy chưa chốt; phải hoàn tất design/plan và kiểm tra nguồn chính thức trước mọi tích hợp. Đây không phải quyền gọi TTS.

**Tiến độ 2026-10-24:** composition `src/remotion/algorithm/video.tsx` đã đổi sang palette sáng theo art direction (token `PALETTE`: nền kem, mực đậm, cam tiến trình, vàng phần tử đang xét, xanh dữ liệu hợp lệ, đỏ cảnh báo; chữ luôn màu mực hoặc kem để giữ tương phản). `npx tsc --noEmit` và `npm run lint` đạt. Chưa render/xem trước bằng mắt, chưa build Docker, chưa có timeline action, TTS hay safe-area check; các mục 3–11 bên dưới còn mở.

**Files dự kiến:**
- `src/lib/algorithm/animation/{schema,check,prompts}.ts`
- `src/remotion/algorithm/{Root,Composition,...}.tsx` (browser-safe, không DB/pg/sharp/fs)
- `src/worker/algorithm-animation-jobs.ts`, `src/worker/algorithm-render-jobs.ts`, registry
- `src/app/designs/[id]/algorithm/animation/*`, `/video/*`
- `src/app/api/files` nếu cần kind-aware range/file handling

1. DSL allowlist theo spike; strict parse ID/ref/timeline/bounds/size/safe area. Code và lời thoại chỉ render text; không eval, arbitrary URL/path.
2. Animation chỉ từ script cuối và manifest đã duyệt; không sửa nội dung lời giải/script. Feedback hình ảnh sửa animation; semantic issue quay lại stage do người dùng chọn.
3. Xây palette token sáng cho composition algorithm: nền kem, mực đậm, cam/vàng làm điểm nhấn, xanh cho trạng thái/data hợp lệ, đỏ cho loại bỏ/cảnh báo; giữ tương phản, semantic color cố định và kiểm tra safe area dọc.
4. Bổ sung timeline action declarative có giới hạn (enter/exit, move, highlight, update state), đồng bộ code highlight, pointer và dữ liệu truy vết; mỗi hành động gắn scene/cue ID, có duration/easing hữu hạn, khoảng giữ để đọc và kiểm tra không chồng lấn sai ý nghĩa.
5. Composition riêng, không đổi `SceneDsl`; Remotion packages đồng phiên bản 4.0.537; không import Node-only code.
6. Preview Player và worker static dùng cùng composition/props/frame config; xem từng mốc trong hook, trace, code và recap bằng mắt.
7. Worker kiểm kind, revision/fingerprint và asset approvals ngay trước render; stage đúng asset cần dùng; output ID/path riêng, không ghi đè bản cũ.
8. Voiceover TTS tiếng Việt **local bằng VieNeu-TTS v3 Turbo** (user chốt 2026-10-24; spike đã chạy OK trên CPU, RTF khoảng 0,27): giọng sẵn miền Nam, không clone, không watermark. Việc còn lại trước khi tích hợp: user chọn giọng cụ thể sau khi nghe mẫu; ghim phiên bản `vieneu`; quyết định đóng gói (container riêng hay trong worker; image worker là Debian Node 22 nên cần thêm Python và ~0,8 GB venv, ~0,6 GB model, cache model ngoài image); audio format và lưu file; cách đọc ký hiệu toán/code thành lời.
9. Tốc độ đọc mặc định 1,25×, cấu hình 1,0×–1,5×. Turbo không có tham số tốc độ nên time-stretch bằng ffmpeg `atempo` sau khi sinh (đã đo thời lượng ở spike); phải nghe thử chất lượng ở 1,25× và 1,5× trước khi chốt. Không auto-speed toàn video đồng đều: giữ chậm ở công thức/code/trace, nhanh hơn ở chuyển tiếp/tóm tắt nhưng vẫn trong giới hạn đã duyệt.
10. Audio generation chạy trong worker queue theo từng cue/scene, không giữ lock lúc chờ review; lưu output audio bằng đường dẫn nội bộ/fingerprint, retry có backoff theo quota, không ghi đè asset/audio đã duyệt.
11. Tính timeline scene từ audio duration thực tế; phụ đề bám cue và duration, kiểm đọc được theo profile §14, tránh cắt lời hoặc đè lên vùng UI/safe area. Preview có điều khiển play/pause/seek và nghe voice trước khi duyệt.
12. Dispatch render theo kind mà không làm đổi hành vi cartoon; render job có thể giữ lock trong lúc chạy, nhưng review wait nằm ngoài queue.
13. Review gắn output ID/fingerprint; reject cần reason và quay đúng stage; approve hoàn tất workflow. Không enqueue YouTube.
14. Feedback render có thể tạo lesson proposal nhưng không auto-approve.

**Xác minh:** typecheck/lint/build; preview/render thực tế chỉ khi môi trường và quyền được xác nhận; không test. Với TTS phải kiểm tra qua nghe mẫu có duyệt, alignment audio/subtitle ở nhiều mốc, đầu/cuối cue, chuyển cảnh và playback toàn video; không coi chỉ build thành xác minh chất lượng giọng hoặc độ mượt. Chỉ gọi dịch vụ sau khi vendor/voice/cost đã được user duyệt.

## Lát 7 — Tích hợp, tài liệu và kiểm tra phát hành

**Files dự kiến:** `CLAUDE.md`, `README.md`, spec/plan/spike và tài liệu liên quan.

1. Rà toàn bộ entrypoint: project/tree, overview, design tabs, asset approvals, jobs, handler dispatch, file range playback.
2. Tìm mọi read/write `videos.status` và phân nhánh theo kind; rà `scripts/scenes/renders/asset_proposals` để không nhận nhầm ID/dữ liệu algorithm.
3. Review SQL migration/backfill/constraints/FK/index; xác nhận dữ liệu cũ = cartoon. Hỏi riêng trước apply/deploy.
4. Ghi rõ hai pipeline, rebuild/restart worker, giới hạn no TTS/crawler/upload và playbook approval.
5. Chạy xác minh không phải test khi tới lát này: `npm run lint`, `npx tsc --noEmit`, `npm run build`. Không chạy file `*.test.*` hoặc `*.spec.*`.
6. Báo migration/deploy steps; không apply DB, deploy Docker, commit/push khi chưa được yêu cầu.

## File đã định vị khi lập plan

- Tạo/action: `src/app/projects/[id]/new-design/page.tsx`, `src/components/videos/create-video-form.tsx`, `src/app/designs/actions.ts`.
- DB/tree: `src/lib/db/schema.ts`, `drizzle/`, `src/lib/video/queries.ts`, `src/lib/project/tree.ts`, `src/lib/project/queries.ts`.
- UI: `src/app/designs/[id]/layout.tsx`, `src/app/designs/[id]/page.tsx`, `src/components/designs/design-tabs.tsx`, `src/app/page.tsx`, project pages.
- Queue: `src/lib/queue/jobs.ts`, `src/worker/handlers.ts`, `src/worker/runner.ts`, `src/worker/index.ts`.
- Cartoon boundaries: casting/script/scene/render/upload worker jobs; `src/lib/scene/schema.ts`, `catalog.ts`; `src/remotion/Root.tsx`, `VideoComposition.tsx`.
- Asset: `src/worker/asset-jobs.ts`, `src/lib/assets/`, `src/lib/casting/queries.ts`, current asset/variant review actions.

## Rủi ro

- Nullable status có thể phá assumptions trong tree/list/status UI nếu guard kind thiếu.
- Form hiện tạo cartoon + casting job và cần chr+bg duyệt; algorithm phải bypass mà không làm lỏng điều kiện cartoon.
- Dùng nhầm bảng chung có thể ghi sai status hoặc va chạm output.
- LangGraph resume replay node; DB/checkpoint/outbox có thể lệch nếu không idempotent/reconciled.
- Worker tuần tự: render có thể block job khác; human wait không được nằm trong queue.
- Remotion app/player và webpack worker khác runtime; composition phải browser-safe và props nhất quán.
- Asset approval hiện có side effect casting; tích hợp algorithm không được gây side effect casting nhầm.
- App chưa có authentication; approval history không đồng nghĩa có authorization.
- Không có automated tests được phép; chỉ spike/inspection/lint/type/build.

## Duyệt và tiến hành

User đã yêu cầu tiếp tục sau báo cáo Lát 0; phiên này triển khai Lát 1 và dừng báo kết quả. Không tự chạy lần lượt hết các lát; sau mỗi lát báo kết quả. Nếu cần đổi schema/contract ngoài spec, dừng và xin duyệt sửa spec. Apply migration, deploy, commit là hành động riêng cần chỉ thị rõ.

Attribution nếu sau này user yêu cầu commit: `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
Plan này không bao gồm commit.