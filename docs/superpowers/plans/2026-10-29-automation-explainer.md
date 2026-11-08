# Automation Explainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây khu vực Automation độc lập, biến câu hỏi về công nghệ/hệ thống đời thường thành video explainer có nguồn, ba cổng duyệt và gói tải xuống.

**Architecture:** Workflow do code điều phối, artifact bất biến có phiên bản và dependency hash. Domain/contract/render input riêng; chỉ dùng chung hạ tầng thích hợp với app cũ. Safe source reader, durable operation ledger và server-side approval là nền tảng trước khi bật LLM/TTS/render thật.

**Tech Stack:** Next.js 15.5.28, React 19.1.0, Remotion 4.0.537, Drizzle 0.45.4/pg, pgmq, Zod, TypeScript, storage DATA_DIR, integration 9router hiện có. Không nâng framework. Dependency mới dự kiến ghim: htmlparser2 12.0.0, ipaddr.js 2.5.0, tar-stream 3.2.2; @types/tar-stream 3.1.5 là dev dependency; chỉ cài sau khi plan được duyệt.

**Spec:** `docs/superpowers/specs/2026-10-29-automation-explainer-design.md` — user đã duyệt ngày 2026-10-29. Plan này **chờ duyệt và chọn phương thức thực thi**.

## Global Constraints

- Khán giả: người trưởng thành tò mò; một câu hỏi, một ý tưởng trung tâm; công nghệ/hệ thống đời thường.
- Một hồ sơ kênh; nhập câu hỏi thủ công; video ngang 4–6 phút; mặc định 1920×1080, 30 fps, H.264 MP4.
- Ba cổng duyệt: nghiên cứu → kịch bản/storyboard + preview → video/thumbnail/metadata cuối. Im lặng không phải đồng ý.
- Không upload YouTube, tự săn trend, nhiều kênh, video dọc, footage/music ngoài, video sinh AI hoặc mã dựng cảnh tùy ý.
- Không phụ thuộc series/project/design, không đổi video_kind/mode để thêm Automation, không xóa dữ liệu Cartoon/Bài giảng.
- Max một lần sinh + hai lần sửa nội dung. Không silently fallback model/provider.
- Nguồn: HTTPS port 443, hostname allowlist, 15 giây, tối đa 2 MiB/source, tối đa 6 nguồn/video; không login/PDF/JS execution.
- Không gọi dịch vụ có phí, apply migration, public deploy, commit hoặc push nếu chưa được cho phép cho hành động tương ứng.
- AGENTS.md thắng TDD của skill: **không viết/sửa/chạy test, fixture hay mock dành cho test**. Chỉ static checks và các bước xem xét thủ công được cho phép. Chạy app/pilot có nguồn ngoài/chi phí phải được user cấp phép riêng.
- `context7` vẫn không có sau lookup 2026-10-29; understand-anything không có trong skill catalog. Trước khám phá rộng hoặc implementation: khôi phục công cụ bắt buộc hoặc xin user cho phép dùng tài liệu chính thức + đọc code có mục tiêu thay thế. Không coi approve spec/plan là miễn quy tắc công cụ.
- Không thêm auth toàn app. Chưa có rào truy cập local/private hoặc upstream phù hợp thì chưa bật Automation có khả năng gọi dịch vụ có phí.

## Review Focus

1. Hai tab duyệt cùng lúc hoặc job cũ kết thúc sau lần sửa: chỉ đúng revision được tiến bước, kết quả cũ stale — Task 2/3/8/9.
2. Worker chết sau khi upstream đã nhận request nhưng trước lúc ghi kết quả: không tự charge lại, chuyển uncertain — Task 4/8.
3. URL redirect/rebinding/IPv4-mapped IPv6 hoặc trang chứa chỉ thị giả: không truy cập nội bộ, không nâng quyền nội dung nguồn — Task 5/6.
4. Audio dài hơn storyboard, cue rất ngắn, chữ tiếng Việt dài: không cắt thoại/ép tăng tốc, không render ngoài layout — Task 7/8/9.
5. File nguồn trong DATA_DIR và bundle bị đổi sau duyệt: không rò toàn văn qua file route, không export bộ file sai phiên bản — Task 5/9/10.

Mỗi dòng được gắn với checklist xem xét thủ công tại task sở hữu. Không tạo automated tests để thực hiện checklist.

---

## 0. Quy tắc thực thi và mốc bàn giao

Plan này là **một MVP tích hợp**, chia 11 task có ranh giới review độc lập; trạng thái trung gian chỉ dùng local/private, không phát hành chức năng nửa an toàn. Task 1–4 tạo nền tảng; 5–6 hoàn thành flow research; 7–9 tạo storyboard/production; 10 export; 11 UI và nghiệm thu tích hợp. Không mở ba subsystem video khác.

Trước code: kiểm lại git status, không ghi đè thay đổi mode-switch đang có. Nếu dùng worktree, phải lựa chọn rõ base commit và chuyển những thay đổi cần thiết có chủ đích; worktree không tự mang uncommitted edits. Không tự stash/commit để giải quyết.

Static checks sau mỗi task có code: `npx tsc --noEmit`, `npm run lint`. Mốc tích hợp: `npm run build`. Expected: exit 0; lỗi có sẵn ghi riêng, không tuyên bố đã pass nếu lệnh fail. Schema generation chỉ qua `npm run db:generate`; không apply vào DB đang dùng trước khi user cho phép. Không tự khởi động app, container, paid calls hoặc benchmark để xác minh.

Không có bước commit tự động. Khi user yêu cầu: stage file tường minh theo một thay đổi logic, Conventional Commits, footer attribution theo phiên; migration/lockfile chỉ stage nếu thuộc task tương ứng.

## 1. Bản đồ file và hợp đồng liên task

Các file mới dự kiến theo trách nhiệm (tên không đại diện cho file đã tồn tại):

- `src/lib/automation/contracts/{common,profile,research,storyboard,output}.ts`: Zod strict schemas và inferred types thuần; không DB/fs.
- `src/lib/automation/{fingerprint,state,checks}.ts`: canonical hashes, transition/invalidation và vấn đề kiểm máy.
- `src/lib/automation/{queries,commands,revisions,reviews,runs,outputs,usage}.ts`: domain server dùng DB; không dùng server-only nếu worker import.
- `src/lib/automation/sources/{policy,fetch,extract,store}.ts`: URL/network policy, bounded HTTPS, text extraction, snapshot.
- `src/lib/automation/generation/{research-prompt,storyboard-prompt,metadata-prompt}.ts`: prompt builders nhận data không tin cậy có phân ranh giới.
- `src/lib/automation/visual/{layout,simulate,check,playback}.ts`: layout và state thuần cho validator/Player/render.
- `src/lib/automation/audio/{fingerprint,timeline}.ts`: cache key và audio-derived timeline.
- `src/lib/automation/export/{manifest,subtitles,editorial}.ts`: tạo public payload/serialization thuần; archive thuộc worker.
- `src/worker/automation/{run-guard,llm,research,storyboard,audio,render,package}.ts`: job orchestration/paid boundaries; renderer/bundler chỉ ở worker.
- `src/remotion/automation/{entry,video,scene,objects,thumbnail}.tsx`: composition riêng, đồ họa nội bộ.
- `src/app/automation/{layout,page,actions}.tsx/ts`, `new/page.tsx`, `settings/page.tsx`, `[id]/page.tsx`: UI/server actions; `.tsx/ts` là shorthand phân loại trong bản đồ, tên chính xác ở từng task.
- `src/components/automation/{dashboard,profile-form,video-form,workspace,research-review,storyboard-review,final-review,activity,work-log}.tsx`: UI theo quyết định.
- `src/app/api/automation/[id]/{activity,files/[fileId]}/route.ts`: chỉ đọc tiến độ hoặc trả file qua manifest, không URL/path tùy ý.
- `src/lib/db/schema.ts`: thêm namespace automation cùng file schema repo; không refactor schema cũ.
- `src/lib/queue/jobs.ts`, `src/worker/handlers.ts`: thêm job types/handlers. Không đổi retry global.
- `src/components/app-sidebar.tsx`, `src/components/app-topbar.tsx`: điểm vào độc lập.
- `.env.example`, `docker-compose.yml`, `README.md`: đồng bộ config/bảo vệ truy cập/cách vận hành.

### Tên và type chuẩn dùng trong toàn plan

- `Issue = {code: string; path: string; message: string; severity: 'blocker'|'warning'}`.
- `Hash`: lowercase SHA-256 hex; `canonicalHash(value: unknown): string` sort object keys recursively, giữ thứ tự array; reject non-JSON/nonfinite.
- `ProfileV1`, `ResearchV1`, `AutomationStoryboardV1`, `RenderInputV1`, `FinalBundleV1` có `version: 1`; parse tại mọi boundary đọc JSONB/payload, không cast để bỏ kiểm.
- `Stage = 'brief'|'research'|'storyboard'|'production'|'final'|'complete'`; `ActivityState` đúng spec.
- `ExpectedHead = {videoId: string; lockVersion: number; researchRevisionId: string|null; storyboardRevisionId: string|null; outputId: string|null}`.
- `ActionResult<T> = {ok:true; value:T}|{ok:false; code:string; message:string}`. UI dùng adapter sang FormState hiện có; file use-server không re-export type.
- `RunStage = 'research'|'storyboard'|'preview'|'audio'|'render'|'package'`; job payload **chỉ** `{automationRunId: string}`.
- `OperationState = 'reserved'|'in_flight'|'succeeded'|'failed'|'uncertain'`; state ghi bền trước khi gọi network.
- `RunPermit = {operationKey: string; profileSnapshotHash: string; scope: RunStage; maxCalls: number; unknownCostAcknowledged: boolean}` persisted qua user command, không tin hidden field làm permit.
- `DbTx` theo kiểu transaction repo hiện tại; domain truyền transaction vào `enqueueJobInTransaction`.

## Task 1: Khóa contracts và bộ kiểm dữ liệu thuần

**Files:** Create contracts/common.ts, profile.ts, research.ts, storyboard.ts, output.ts; fingerprint.ts, state.ts, checks.ts trong `src/lib/automation/`.

**Interfaces:** produces schemas/types ở trên; `checkResearch(value: ResearchV1, sources: SourceEvidence[]): Issue[]`; `checkStoryboard(value: AutomationStoryboardV1, research: ResearchV1): Issue[]`; `deriveAutomationState(snapshot: WorkflowSnapshot): DerivedState`; `invalidationFor(change: ChangeKind): Stage[]`.

- [ ] Chốt ProfileV1: singleton snapshot, language, audience/tone, selected model/voice IDs, source hostnames, format, cost policy/price provenance. Schema không có key/token. Required runtime fields chưa đủ thì chỉ draft.
- [ ] Chốt ResearchV1: brief/scope/conclusion, claims `{id,kind:'fact'|'inference'|'assumption',text,central,evidence[],dependsOnClaimIds[],quantity?}`, evidence `{sourceId,sourceHash,start,end,quote}`, unresolvedIssues, visualAngles. Fact central thiếu evidence là blocker; inference cần premises; assumption ghi nhãn không được giả làm evidence.
- [ ] Chốt storyboard declarative: scenes/cues stable IDs; cue `{id,text,spokenText,claimIds,weight}`; object type allowlist; layout preset, assumptions; operation tagged union. Chọn `object.show/hide/move/highlight`, `flow.emit`, `queue.enqueue/serve`, `counter.set`, `callout.show/hide`. Không code/URL/media freeform. Timing theo cue `{cueId,from:0..1,to:0..1}` và khai báo thứ tự rõ.
- [ ] Pin các giới hạn vận hành ban đầu: tối đa 24 scene, 120 cue, 8 objects/scene, 12 queue items, 16 operations/cue, 80 ký tự/label, 300 ký tự/cue. Đây là giới hạn renderer MVP, không thể hiện mọi chủ đề. ID unique toàn video; unsupported dẫn tới blocker và yêu cầu đơn giản hóa.
- [ ] Chốt RenderInputV1 chứa format/timeline/source storyboard hash/audio manifests/layout version; tách FinalBundleV1 khỏi export archive để không hash vòng. Duration 4–6 phút là policy, không reject tuyệt đối trong schema nếu có ngoại lệ được duyệt.
- [ ] Rà thủ công contract: claim bị bỏ, ID trùng, target không tồn tại, thời gian đảo, nonfinite và payload chứa khóa lạ đều bị chặn; schema không được suy ra kiến thức đúng. Chạy static checks.

**Deliverable:** hợp đồng nội bộ thống nhất trước schema/job/UI; không runtime external calls.

## Task 2: Persistence, revision bất biến và migrations

**Files:** Modify `src/lib/db/schema.ts`; Create `src/lib/automation/{queries,revisions,outputs,usage}.ts`; Generate `drizzle/<next>_automation_foundation.sql` và metadata qua drizzle-kit, không tự đoán số kế tiếp.

**Interfaces:** `getAutomationVideo(videoId:string, db?:Db):Promise<WorkflowSnapshot|null>`; `appendRevision(tx:DbTx,input:RevisionInsert):Promise<RevisionRef>`; `createOutput(tx:DbTx,input:OutputInsert):Promise<OutputRef>`; `publishOutput(tx:DbTx,input:PublishedOutput):Promise<void>`.

- [ ] Tạo bảy bảng spec, UUID FKs, timestamps, profile singleton key=1, video lockVersion, stage/activity CHECK text để tránh thêm enum không cần thiết; profile snapshot nằm trên video/run. Content revision/source append-only; stale/active là lifecycle metadata, không sửa payload/hash/dependencies.
- [ ] Revision lưu kind, schemaVersion, sequence, parentId, input revision IDs và content/hash; outputs có kind/status/manifests/hash; reviews liên kết subject với CHECK đúng loại subject; mọi foreign reference cùng video phải được bảo vệ bằng composite FK/transaction guard phù hợp, không chỉ UUID tồn tại.
- [ ] Runs có jobRunId, request key, status, input/dependency snapshot, output refs; unique partial index active requestKey/video. Mỗi run dùng JSONB operation ledger có key bất biến để lưu attempt reservation/usage/outcome, append dưới row lock; không dùng job_runs.metrics làm ledger duy nhất. Có work log JSONB append-only trên video cho phút người nhập, không thêm bảng thứ tám.
- [ ] Thêm `automation_video` vào target_type. Migration enum addition và schema không tham chiếu literal mới trong cùng transaction; queue command dùng sau khi migration commit. Không dùng ngay literal trong CHECK/default/trigger của migration đó.
- [ ] Generate migration; đọc toàn diff, SQL và snapshots: chỉ namespace mới + target enum, không sửa/drop dữ liệu cũ. Nếu tool đề xuất thay đổi enum trùng hoặc drift hiện có thì dừng báo, không tiện thể sửa.
- [ ] Chưa apply. Review thủ công khả năng approve concurrent và output sai video với DB constraints + logic Task 3; static checks. Việc xác minh trên DB chỉ sau khi user cho phép apply vào DB xác định.

**Deliverable:** data layer có compile, SQL migration chờ cấp phép áp dụng.

## Task 3: Server commands, approvals và queue có version guard

**Files:** Create `src/lib/automation/{commands,reviews,runs}.ts`, `src/worker/automation/run-guard.ts`; Modify queue/jobs.ts, worker/handlers.ts.

**Interfaces:** `saveProfile(input:ProfileV1,expectedVersion:number):Promise<ActionResult<number>>`; `createAutomationVideo(input:BriefInput):Promise<ActionResult<string>>`; `startAutomationStage(input:{expected:ExpectedHead;stage:RunStage;permit:RunPermit}):Promise<ActionResult<string>>`; `approveResearch/approveStoryboard/approveFinal(input:ReviewInput):Promise<ActionResult<ExpectedHead>>`; `requestRevision(input:RevisionRequest):Promise<ActionResult<ExpectedHead>>`; `archiveAutomationVideo(expected:ExpectedHead):Promise<ActionResult<void>>`; `loadRunContext(runId:string):Promise<RunContext>`; `commitRunResult(input:RunCommit):Promise<'published'|'stale'>`.

- [ ] Khóa row video trước kiểm version; transaction lock order cố định profile → video → run. Command đọc effective approvals server-side; không lấy status/head/profile/permit từ form làm sự thật.
- [ ] Tạo job types `automation.research`, `.storyboard`, `.preview`, `.audio`, `.render`, `.package`; run trước enqueue trong cùng transaction. Đăng ký handler trong task tương ứng; handler chưa sẵn sàng phải fail closed không gọi paid API.
- [ ] Approve cổng 1 chọn research; cổng 2 bắt preview khớp storyboard/hash; cổng 3 bắt FinalBundle hash, file hashes và không còn blocker. Approval và next-stage enqueue chỉ cùng transaction nếu permit đủ; nếu không, chuyển idle “Cần xác nhận chi phí”, không tự chạy.
- [ ] Áp dụng invalidationFor; giữ audit cũ. Archive làm tăng lockVersion, chặn publish/downstream; không hard-delete. CommitRunResult kiểm head/dependencies lần nữa trước active pointer update.
- [ ] Rà thủ công hai approve cùng version, double submit/start, archive trong render, kết quả job cũ: lần sau trả conflict/stale; không enqueue hai successor hoặc coi archived là complete. Static checks.

**Deliverable:** state engine fail-closed, chưa gọi dịch vụ.

## Task 4: Durable operation ledger, chi phí và adapter LLM

**Files:** Create `src/lib/automation/usage.ts` (bổ sung Task 2), `src/worker/automation/llm.ts`; bổ sung run-guard.ts; Modify `.env.example`, `docker-compose.yml` runtime anchor, `README.md`; không đổi retry global hoặc client cũ gây regression.

**Interfaces:** `reserveOperation(input:ReserveInput):Promise<OperationReservation>`; `markInFlight(key:string):Promise<void>`; `settleOperation(input:SettleInput):Promise<void>`; `runPaidOperation<T>(input:PaidOperation<T>):Promise<T>`; `generateAutomationStructured<T>(input:StructuredInput<T>):Promise<{data:T;model:string;usage:UsageSummary}>`.

- [ ] Thêm `AUTOMATION_EXECUTION_ENABLED=false` đồng bộ env/compose. Khi false cho draft/review/read nhưng không chạy external generation. Không dùng env flag làm auth; hướng dẫn operator giữ private hoặc cấu hình upstream access trước bật. Không suy ra an toàn từ Host header.
- [ ] Budget lock profile row serialize tổng tháng + video/run; giá decimal hoặc minor units rõ currency, không cộng currency khác; actual/estimated/unknown riêng. Reservation cộng outstanding/uncertain, mọi repair có operation key riêng, reserve trùng trả hiện trạng.
- [ ] Trước request ghi in_flight bền; persist raw response/audio trước settle và parse. Khi worker resume thấy in_flight không có kết quả bền: uncertain, dừng qua PermanentJobError adapter; không gửi lại. Unknown acknowledgement scoped run/call count; repair requests phải nằm trong permit hoặc chờ xác nhận mới.
- [ ] Structured generation giữ model/usage thật, parse schema + semantic, tối đa hai repairs; không dùng helper cũ nếu không bọc được từng call/response trong ledger. Dữ liệu nguồn nằm trong data boundary, không được cấp tool quyền gì. Không thêm model/provider fallback.
- [ ] Khi adapter không hỗ trợ max output bound đáng tin, đánh unknown theo spec, không hứa hard cap. Không tự thêm tham số API chưa xác minh; mọi capability cần docs router hoặc metadata thực.
- [ ] Rà thủ công crash trước call/sau request/sau lưu result/sau settle; known duplicate không gọi lại, uncertain không tự retry qua runner ba lần. Static checks; không live API.

**Deliverable:** hàng rào chi phí và lỗi dùng lại cho tất cả external calls.

## Task 5: Safe source fetch và snapshot không rò qua file route

**Files:** Create `src/lib/automation/sources/{policy,fetch,extract,store}.ts`; Modify `src/app/api/files/[...path]/route.ts` chỉ để từ chối prefix `automation/`; Modify package.json/package-lock.json cho htmlparser2 và ipaddr.js sau approval.

**Interfaces:** `validateSourceUrl(url:string,hosts:readonly string[]):URL`; `readPublicSource(input:{url:string;allowedHosts:readonly string[]}):Promise<SourceDocument>`; `extractSourceText(html:string):ExtractedText`; `saveSourceSnapshot(videoId:string,document:SourceDocument):Promise<SourceEvidence>`.

- [ ] Pin dependencies trực tiếp, đọc license và docs official, không dựa transitive versions. Không tải HTML vào browser để extract; htmlparser2 loại script/style/nav noise; text thuần escaped khi hiển thị. Unsupported type/encoding báo unavailable.
- [ ] HTTPS port 443 exact normalized hostname allowlist (không tự wildcard suffix), reject userinfo/IP literal/private resolution; kiểm tất cả A/AAAA bằng ipaddr normalized mapped addresses, public-unicast + organization deny ranges. Dùng node:https với lookup trả chỉ địa chỉ đã kiểm, SNI/Host hostname gốc, TLS verify bật; kiểm remoteAddress trước ghi body. Không lookup lại unchecked ở retries.
- [ ] Redirect mặc định reject; UI cho nhập destination như URL mới được kiểm và duyệt host. 15s total deadline, 2 MiB body; request identity encoding, reject compressed response ở MVP thay vì decompress không giới hạn; không đọc truncated làm complete. Sáu source gồm successful snapshots active research, retry cùng URL không tính thành nguồn độc lập.
- [ ] Lưu immutable text/hash/source metadata tại `automation/private/sources/<sourceId>/...`; reject prefix automation ở route files chung trước mở file. Automation có own manifest-backed route Task 10; không cho toàn văn source vào download hoặc Remotion publicDir.
- [ ] Rà thủ công các nhánh redirects, mixed public/private DNS, mapped IPv6, localhost/metadata, toobig/content type, source chứa script/instructions. Không thực hiện request vào IP nội bộ để “thử”; dùng đọc logic và tiêu chí review. Static checks.

**Deliverable:** bounded read-only source adapter, không search API hoặc browser execution.

## Task 6: Research generation và cổng duyệt bằng chứng

**Files:** Create `src/lib/automation/generation/research-prompt.ts`, `src/worker/automation/research.ts`; Create `src/components/automation/research-review.tsx`; bổ sung checks/queries/commands và handler registry.

**Interfaces:** handler `generateAutomationResearch(payload:JobPayload,ctx:JobContext):Promise<Record<string,unknown>>`; `buildResearchMessages(input:ResearchPromptInput):ChatMessage[]`; `getResearchReview(videoId:string):Promise<ResearchReviewView>`.

- [ ] Candidate URLs từ user hoặc một call proposal có budget; URL không fetch không trở thành evidence. No search tool claims. Nếu host chưa allowlist, dừng chờ profile/nguồn có duyệt, không tự mở rộng policy video snapshot.
- [ ] Fetch snapshots hợp lệ, gọi generateAutomationStructured với brief + sources thực. CheckResearch xác nhận quote bằng offsets trong exact snapshot, hash và known source IDs; thiếu central evidence/inference premises chuyển blocked.
- [ ] UI hiển thị claim, quote, nguồn/ngày/limitations và unresolved blockers. Cho thêm URL hoặc sửa hướng tạo revision; không approve có blockers; warning cần acknowledgment cụ thể lưu review.
- [ ] Lưu mô hình/usage qua ledger, không dùng copyrighted full text làm public output. Không làm job tiếp nếu research revision stale.
- [ ] Rà flow không nguồn/nguồn hỏng/quote bịa/instruction giả/central assumption chưa gắn nhãn: không thể coi một LLM judge pass là đủ. Static checks; live research chỉ khi user cho phép.

**Deliverable:** câu hỏi → research review, có thể chặn/duyệt an toàn.

## Task 7: Storyboard planner và renderer thuần có preset

**Files:** Create `src/lib/automation/visual/{layout,simulate,check,playback}.ts`; `src/lib/automation/generation/storyboard-prompt.ts`; `src/worker/automation/storyboard.ts`; `src/remotion/automation/{entry,video,scene,objects,thumbnail}.tsx`.

**Interfaces:** `planScene(scene:SceneV1):LayoutPlan`; `simulateScene(scene:SceneV1):SceneTrace`; `stateAt(trace:SceneTrace,progress:SceneProgress):VisualState`; `checkVisuals(storyboard:AutomationStoryboardV1):Issue[]`; `buildRenderInput(input:PlaybackInput):RenderInputV1`; `generateAutomationStoryboard(payload:JobPayload,ctx:JobContext)`; compositions `AutomationExplainer`, `AutomationThumbnail`.

- [ ] Implement fixed layouts `flow`, `queue`, `compare`, `callout`; grid slots thay vì LLM tự chọn pixel tọa độ. Check fit, labels, font measurements bằng font thực; safe area 96px, caption vùng riêng, không màu sắc đơn độc để truyền nghĩa. Font bundle dùng asset local có license được ghi, không network font.
- [ ] Vẽ các icon cơ bản nội bộ theo primitives, không lấy ảnh web. Shared simulator áp operations, kiểm queue index, flow target, counter arithmetic và thứ tự; không mã động/eval. Không lấy số liệu do LLM đoán làm kết quả mô phỏng.
- [ ] Planner kiểm before preview; nhiều object/text quá dài trả blocker để sửa. Queue arithmetic so state trước/sau; giả định phải hiện trong scene tương ứng.
- [ ] Generate storyboard từ approved research bằng ledger. Cues chỉ tham chiếu existing claims; semantic review luôn cần user, checker không giả vờ phát hiện được mọi claim mới ẩn trong câu chữ. Đánh dấu nếu LLM yêu cầu fact mới và quay research.
- [ ] Composition chỉ nhận RenderInputV1, không import DB/fs/server-only hoặc arbitrary URL. Player/static khác resolver asset được truyền ở boundary, không data discovery trong browser. Renderer thật và preview dùng cùng simulate/layout version.
- [ ] Rà mô hình + source mapping + chữ dài/target sai/fps limits. Static checks và build; không tạo runnable demos/fixtures dành cho test.

**Deliverable:** storyboard có thể kiểm hình trước paid production; renderer entry riêng không ảnh hưởng algorithm.

## Task 8: Audio, timeline thật và preview cổng 2

**Files:** Create `src/lib/automation/audio/{fingerprint,timeline}.ts`, `src/worker/automation/audio.ts`; bổ sung render.ts cho preview; Create `src/components/automation/storyboard-review.tsx`; bổ sung ledger/outputs/commands.

**Interfaces:** `audioFingerprint(input:AudioIdentity):string`; `buildAudioTimeline(storyboard:AutomationStoryboardV1,clips:AudioClip[]):TimelineV1`; `generateAutomationAudio(payload:JobPayload,ctx:JobContext)`; `renderAutomationPreview(payload:JobPayload,ctx:JobContext)`; `isPreviewCurrent(snapshot:WorkflowSnapshot):boolean`.

- [ ] Chọn service model/voice rõ từ metadata thực, không thay adapter toàn repo. Cue cache key gồm spokenText/language/model/voice/config/service version identity; scope cache theo profile cho MVP. File checksum và duration phải verified mới reuse.
- [ ] Một paid operation/cue qua ledger; persist bytes và measurements trước succeeded. Dùng audio decode/metadata library đã có sau đối chiếu docs/version; duration ước lượng từ ký tự không được làm timeline cuối.
- [ ] Preview chọn scene khó do planner đề xuất, người dùng đổi được. Tạo clip thật 15–30s từ đoạn cue liên tiếp (có thể nhiều scene), normalize timeline đúng cùng renderer; chỉ TTS cue cần thiết. Khoảng preview không đủ thời lượng: chọn đoạn khác, không cắt giữa lời/tăng tốc. Preview audio tái dùng cho production nếu fingerprint khớp.
- [ ] Approve storyboard bắt current preview + mọi visual blocker resolved; preview chạy trên draft không tạo loophole full render trước cổng 2. Unknown permit chỉ cover đúng cue/call được cho phép.
- [ ] Cue editor text/spokenText giữ semantic review; đổi tạo revision, invalidate preview/final; audio fingerprint còn khớp được reuse. UI hai cột lời/hình và feedback theo scene ID.
- [ ] Rà crash mid-audio/preview stale/very short cues/tiếng Việt dài. Render/paid calls không chạy khi chưa user cho phép; static checks.

**Deliverable:** storyboard review có preview thật và dependency gates, không phải ảnh giả.

## Task 9: Production, final bundle và cổng 3

**Files:** Create/bổ sung `src/worker/automation/render.ts`; Create `src/lib/automation/export/{manifest,subtitles}.ts`, `src/lib/automation/generation/metadata-prompt.ts`; Create `src/components/automation/final-review.tsx`; bổ sung outputs/reviews/commands.

**Interfaces:** `renderAutomationVideo(payload:JobPayload,ctx:JobContext)`; `prepareFinalBundle(input:FinalBundleInput):Promise<FinalBundleV1>`; `verifyBundleFiles(bundle:FinalBundleV1):Promise<Issue[]>`; `buildSrt(timeline:TimelineV1):string`.

- [ ] Production sau cổng 2 tạo remaining audio có checkpoint per cue; timeline actual. 240–360s nằm policy. Ngoài khoảng: blocked với hướng sửa hoặc user duration exception scoped exact storyboard/timeline hash + reason; không tự nới duration.
- [ ] Render ở temporary directory, publicDir chỉ local font/audio được chọn; alias @ cho webpack; bundle version 4.0.537; heartbeat khi render + audio/long work; heartbeat lỗi liên tiếp phải dừng/không publish thay vì swallow vô hạn. Không mở concurrency workers trong scope.
- [ ] Kiểm đầu vào trước render và head lại trước publish. Artifact immutable lưu `automation/public/<outputId>/...`; archive khi đang render chặn active result. File ghi tmp → atomic publish, checksum/size/duration/codec trước ready. Không reuse output không verify file.
- [ ] Metadata từ approved content có call ledger nếu dùng LLM; chapters dựa timeline thật; tối đa ba thumbnail preset render bằng cùng font/objects, không image API. Không thêm fact mới hoặc cam kết gây hiểu lầm.
- [ ] FinalBundleV1 freeze video/subtitles/thumbnail/metadata/sources/editorial hashes + input/dependency hashes. Bundle hash loại trường self-hash; review hash exact canonical payload. Cổng 3 lưu review reference ngoài payload hash để tránh vòng phụ thuộc.
- [ ] Rà thiếu clip/hash mismatch/source raw leaked/stale render/metadata sửa sau duyệt: block hoặc invalidate đúng cổng. Static checks/build; thực tế nghe/xem cần buổi nghiệm thu có phép.

**Deliverable:** bản cuối phát được, current final review, chưa tự công khai.

## Task 10: Export có checksum và file endpoints giới hạn

**Files:** Create `src/lib/automation/export/editorial.ts`, `src/worker/automation/package.ts`; Create `src/app/api/automation/[id]/files/[fileId]/route.ts`; Modify package.json/lockfile tar-stream + @types/tar-stream.

**Interfaces:** `buildEditorial(snapshot:ApprovedEditorial):EditorialExportV1`; `packageAutomationVideo(payload:JobPayload,ctx:JobContext)`; `resolveAutomationFile(input:{videoId:string;fileId:string}):Promise<DownloadFile|null>`.

- [ ] Xuất `video.mp4`, `subtitles.srt`, `thumbnail.png`, `metadata.json`, `sources.md`, `manifest.json`, `editorial.json`; không toàn văn source/private paths/API key. Chỉ serialize allowlisted fields, không spread DB rows/run snapshots ra export.
- [ ] Archive dùng tar-stream + node:zlib gzip thành `export.tar.gz`, stream file không đọc toàn MP4 vào RAM. Tên entry cố định, size/hash verified; không tuyệt đối/../symlink. Kiểm license dependency trước cài.
- [ ] File endpoint lấy fileId trong DB manifest của video, không nhận path từ user. Draft preview/audio được phép đọc theo current manifest, nhưng finalized individual assets/archive cần effective final approval. Không exposure raw source. Hỗ trợ Range cho MP4, content type/disposition download đúng; reject invalid/suffix range không hợp lệ, no-store.
- [ ] Package chạy sau cổng 3; manifest payload frozen trước duyệt, kèm review receipt ngoài hash nếu cần. Archive output giữ hash riêng trong outputs; không chèn hash archive vào manifest bên trong chính archive. Missing/hash changed ⇒ block, không gán complete.
- [ ] Rà thao tác tải sau revision mới, fileId khác video, source path đoán, tampered file, archive aborted: 404/blocked, không trả dữ liệu sai revision. Static checks/build.

**Deliverable:** gói tải riêng và archive khớp phiên bản được duyệt, không upload API.

## Task 11: UI độc lập, vận hành và handoff pilot

**Files:** Create `src/app/automation/{layout.tsx,page.tsx,actions.ts}`, `new/page.tsx`, `settings/page.tsx`, `[id]/page.tsx`; Create `src/components/automation/{dashboard,profile-form,video-form,workspace,activity,work-log}.tsx`; Create `src/app/api/automation/[id]/activity/route.ts`; Modify app-sidebar.tsx, app-topbar.tsx, README.md; cập nhật CLAUDE.md chỉ mục Automation khi feature thực sự tồn tại.

**Interfaces:** `getAutomationDashboard():Promise<DashboardView>`; `getAutomationWorkspace(videoId:string):Promise<WorkspaceView|null>`; `recordHumanWork(input:{videoId:string;minutes:number;note:string}):Promise<ActionResult<void>>`; read-only activity endpoint trả stage/state/signature/blockers, không trả secret/full prompt/source body.

- [ ] Trang DB `dynamic='force-dynamic'`; sidebar link không mode filter, topbar pathname Automation ghi khu vực mới và nhắc mode cũ không áp dụng. Không thay enum Mode hoặc route design cũ. Default workspace mở quyết định đang chờ; sections chuyển được nhưng actions server-side vẫn gate.
- [ ] Dashboard priority cần quyết định → đang sản xuất → drafts/completed; không “duyệt tất cả”. Profile singleton edit expectedVersion, source host approval rõ. New form bắt câu hỏi, optional fields collapsed; chưa đủ runtime config vẫn save draft.
- [ ] Actions dùng FormState + feedback pattern repo phù hợp, inputs kiểm server; controlled select gửi hidden value theo convention React repo. Chi phí actual/estimated/unknown hiển thị khác nhau; permit không tự bật lại sau refresh. Lỗi text không đưa raw upstream chứa secret ra UI.
- [ ] Activity client poll read-only 2s khi active/10s idle, pause hidden, refresh chỉ signature đổi; không reuse endpoints design theo ID giả. Source full text chỉ render ở review server query, không generic file URL.
- [ ] Work log minutes nhập thủ công có timestamp; dashboard stats không suy giờ người từ thời gian mở tab. Usage breakdown per attempt, queue wait/render time và unknown rõ. Không hứa doanh thu hoặc năng suất C.
- [ ] README ghi setup/local-private condition, budgets, license/voice checks, restore uncertain operation, no cleanup tự động; operator không retry uncertain nếu chưa xác minh upstream. Chỉ documentation bật env, không tự expose public tunnel/deploy.
- [ ] Chạy lint/typecheck/build, report output thật và baseline issues. Không chạy test; không start app/paid pilot khi chưa cho phép.
- [ ] Trình user checklist nghiệm thu thủ công ba pilot: Wi-Fi, giao nhận, hàng đợi; xác nhận ngân sách, máy và quyền trước khi chạy. Quan sát ba cổng, revision invalidation, export và nghe/xem; các probe thao tác chống race/timeout chỉ làm khi user đồng ý phạm vi, không tự thêm scripts test.

**Deliverable:** MVP tích hợp chờ operator cấu hình và cấp phép pilot; tách rõ “code build được” và “đã chạy đủ ba video”.

## Nguồn đối chiếu và điểm xác minh trước code

Phiên 2026-10-29 đã đọc spec và các file tích hợp: queue/jobs.ts, worker/handlers.ts, worker/algorithm-render-jobs.ts, lib/storage/index.ts, lib/audio/files.ts, api/files/[...path]/route.ts, app-topbar.tsx. Không sao chép lỗi/pattern không đáp ứng spec (ví dụ swallow heartbeat hoặc retry paid uncertain).

- Node 22 HTTPS options/TLS: https://nodejs.org/docs/latest-v22.x/api/https.html
- Node streaming gzip: https://nodejs.org/docs/latest-v22.x/api/zlib.html
- Parser official repo: https://github.com/fb55/htmlparser2
- IP classification official repo: https://github.com/whitequark/ipaddr.js
- Streaming tar official repo: https://github.com/mafintosh/tar-stream
- PostgreSQL row locks/ordering: https://www.postgresql.org/docs/current/explicit-locking.html
- Remotion render: https://www.remotion.dev/docs/renderer/render-media
- OWASP fetch defense: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html

`npm view` chỉ đọc registry đã trả htmlparser2 12.0.0, ipaddr.js 2.5.0, tar-stream 3.2.2, @types/tar-stream 3.1.5. Chưa cài package; phải kiểm engine/license khi thực thi. API/version TTS/router và font/audio probing cần đối chiếu tài liệu/kiểu thực tế lúc code; thiếu xác nhận thì chặn task liên quan, không đoán parameter.

## Self-review và cổng bắt đầu

- Spec §1–5: Task 1/2/11; §6–7: Task 3/5/6/8/9; §8: Task 1/7/8/9.
- Spec §9–11: Task 2/3/4; §12: Task 9/10; §13–14: Task 11 và Review Focus.
- Snapshot/hash/state names dùng chung trong Interfaces; partial rebuild chỉ reuse audio, render toàn tập được phép.
- Không có code product, migration apply, test hoặc paid call được thực hiện bởi tài liệu này.

User duyệt plan và chọn **Native** hoặc **Subagent-driven** trước triển khai. Cần khôi phục context7/understand-anything hoặc user cho phép thay thế theo Global Constraints. Sau đó mới bắt đầu Task 1; DB apply và live paid pilot vẫn là quyền riêng cần xin ở bước tương ứng.
