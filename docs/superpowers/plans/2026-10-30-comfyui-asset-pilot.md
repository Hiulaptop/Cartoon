# ComfyUI Asset Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans after user reviews this plan and selects execution method. Steps use checkbox (`- [ ]`) syntax for tracking. AGENTS.md overrides all skill defaults about tests, commits and runtime actions.

**Goal:** Cho phép operator gọi workflow ComfyUI đã phát hành để sinh biến thể của asset có sẵn, nhận file và duyệt trong app mà không tự sinh trùng khi lỗi kết nối.

**Architecture:** App sở hữu command, snapshot, durable run và artifact; adapter ComfyUI chỉ kiểm tra/gửi/theo dõi/tải workflow được allowlist. Một bảng comfy_image_runs giữ vòng đời độc lập với job_runs.metrics; luồng biến thể dùng lại hậu xử lý và duyệt hiện có, có reservation và publish guards chung với backend cũ. Không chuyển voice/render/Automation sang ComfyUI trong pilot.

**Tech Stack:** Next.js 15.5.28, React 19.1.0, Remotion 4.0.537 không đổi; TypeScript, Zod 4, Drizzle/pg và pgmq có sẵn; ComfyUI 0.43.2 Server API trực tiếp, không thêm SDK. Repo khai báo drizzle-orm ^0.45.4, lockfile phải xác nhận lại trước code.

**Spec:** `docs/superpowers/specs/2026-10-30-comfyui-asset-pilot-design.md` — user duyệt ngày 2026-10-30.

**Status:** User đã duyệt plan và chọn **Native** trong chat ngày 2026-10-30. Implementation foundation đang thực hiện trong checkout hiện tại; sinh migration SQL được phép, không apply/generation/runtime/commit.

## Global Constraints

- Chỉ ComfyUI cho biến thể của asset có sẵn; createAsset/Casting/algorithm producers giữ 9router. Payload cũ thiếu backend = 9router.
- Một workflow local đã nghiệm thu, batch size 1, một output PNG. Không có model/API graph thực tế thì registry rỗng và Comfy fail-closed; không tạo graph/model giả.
- Backend/workflow/prompt/seed/size được snapshot khi enqueue. Không silent fallback.
- Không tự viết/sửa/chạy test files, fixture/mock hoặc test scripts. Các bước TDD trong skill được thay bằng source review, lint/typecheck/build; runtime cases là checklist cần quyền riêng, không phải bằng chứng đã chạy.
- Không tự start app/container/ComfyUI, tải model/node, chỉnh firewall/listen address/.env, gọi generation, apply migration, commit hoặc push.
- Giữ dirty checkout feat/mode-switch và mọi thay đổi trước đó. Không reset/stash; staging/commit chỉ khi user yêu cầu riêng.
- Comfy integration mặc định false, không authentication. Không public generation không bảo vệ; không tự bật tunnel.
- Ảnh tối đa 25 MiB, tối đa 16 triệu pixel; output đúng size đã snapshot, không resize che sai lệch.
- Theo dõi mặc định 900 giây, tối đa cấu hình 3600 giây; heartbeat pgmq mỗi 20 giây gia hạn 300 giây.
- Singleton Comfy executor và variant exclusion dùng session advisory lock trên dedicated pg client, không DB transaction xuyên network; mất lock không có nghĩa upstream dừng.
- File theo run ID immutable; dữ liệu run không nằm riêng trong metrics, không raw private file exposure.
- Một migration additive chỉ cho pilot, generate sau implementation approval, không apply; không đoán số migration trước khi xem journal thực tế.

## Review Focus

Không có automated behavioral coverage theo luật repo. Những điểm sau phải source-review có chủ đích và chỉ nghiệm thu runtime khi được phép:

1. POST đã nhận nhưng mất response/DB write: không tự POST lại, không coi correlation ID là idempotency (Tasks 2, 4).
2. Job 9router cũ đang sinh hoặc hai tab thao tác cùng variant: reservation/approval/publish cùng lock protocol, không ghi đè output mới (Tasks 3–5).
3. Redelivery của run succeeded hoặc worker chết sau download: tái dùng artifact bền vững, không hạ approved về generating hoặc chạy GPU lại (Task 4).
4. Queue/history mất sau restart, endpoint/graph thay đổi hoặc abandonment lúc response đến muộn: giữ unresolved, không publish nhầm hay resubmit (Tasks 2–5).
5. Output giả/path traversal/redirect/ảnh quá lớn và worker Docker không truy cập loopback Windows: chặn tại boundary; không mở public port để chữa nhanh (Tasks 2, 6).

---

## File map và ranh giới

**Tạo:**
- `src/lib/comfy/contracts.ts` — strict contracts và state unions.
- `src/lib/comfy/config.ts` — runtime env và endpoint identity.
- `src/lib/comfy/registry.ts` — released graph/manifest lookup, hash/binding validation.
- `src/lib/comfy/client.ts` — bounded HTTP Server API, response normalization.
- `src/lib/comfy/preflight.ts` — read-only compatibility/model/node checks.
- `src/lib/comfy/runs.ts` — SQL state commands/queries và enqueue/resume/abandon.
- `src/lib/assets/generation-lock.ts` — common dedicated-client advisory locking, không import worker.
- `src/worker/comfy-image-jobs.ts` — Comfy execution/recovery/heartbeat/artifact processing.
- `src/components/assets/image-backend-picker.tsx` — controlled choice + hidden form values.
- `src/components/assets/comfy-run-panel.tsx` — status/provenance/recovery commands.
- `docs/comfyui-pilot.md` — workflow release, permissions, operations, manual acceptance.

**Sửa:**
- `src/lib/db/schema.ts`, SQL/snapshot/journal do drizzle-kit sinh.
- `src/lib/queue/jobs.ts` — helper redelivery same job owner; không thay semantics enqueueJob cũ.
- `src/worker/asset-jobs.ts` — common legacy lock/guards, Comfy branch trước legacy generating upsert.
- `src/worker/handlers.ts` — handler mới `asset.comfy_image`.
- `src/app/series/asset-actions.ts` — scoped commands và approve guard.
- `src/components/assets/request-variant-form.tsx`, `src/components/assets/variant-review.tsx` — backend choice/retry semantics.
- `src/app/series/[seriesId]/assets/[assetId]/page.tsx` — sanitized run query/status và Comfy availability.
- `.env.example`, `docker-compose.yml`, `README.md`, `CLAUDE.md` — config và limitations.

**Chỉ tạo khi có workflow thật đã được nghiệm thu:** `src/lib/comfy/workflows/<id>/<revision>.api.json` và `<revision>.manifest.json`. Không placeholder runnable graph. Registry rỗng là trạng thái hợp lệ khi integration chưa được bật.

Không sửa Remotion, Automation, shared runner retries hoặc default create-asset backend để hoàn thành pilot.

## Task 1: Contracts, config và workflow registry fail-closed

**Files:** contracts.ts, config.ts, registry.ts như file map; `.env.example`, `docker-compose.yml`.

**Interfaces:**
- `ImageBackend = "9router" | "comfyui"`.
- `ComfyRunState = "prepared" | "submitting" | "submitted" | "succeeded" | "failed" | "uncertain" | "abandoned" | "stale"`.
- `WorkflowRef = { id: string; revision: string; sha256: string }`.
- `ImageInputs = { positive: string; negative: string; seed: number; width: number; height: number }`; seed integer 0..Number.MAX_SAFE_INTEGER để JSON không làm mất chính xác.
- `WorkflowRelease`: version 1, WorkflowRef, expectedComfyVersion, graph, explicit input/output bindings, defaultSize, allowedSizes, node class allowlist, model file hashes/source/license acknowledgement. Chỉ local core-node text-to-image, không partner/API/code/shell nodes.
- `getComfyConfig(): ComfyConfig`, `listWorkflowReleases(): WorkflowSummary[]`, `loadWorkflow(ref: WorkflowRef): WorkflowRelease`, `parameterizeWorkflow(release, inputs, runId): PreparedGraph`.
- `ComfyConfig = { enabled: boolean; baseUrl: string; endpointHash: string; timeoutSeconds: number }`; endpoint không credential/query/fragment, chỉ http(s), không nhận form URL.

- [ ] **Step 1:** Đọc lại package/lock và imports có sẵn, xác nhận versions trước code. Không thêm dependency cho hash/fetch.
- [ ] **Step 2:** Viết strict Zod contracts version 1. Node ID là numeric-string, graph class_type/inputs hợp lệ; binding node và input phải tồn tại/đúng class; output đúng SaveImage. Reject unexpected fields tại command boundary.
- [ ] **Step 3:** Implement registry tĩnh chỉ import release được review; canonical hash deterministic; graph hash khác manifest thì từ chối. Mutation chỉ trên deep clone tại binding đã cho phép; batch=1, filename_prefix app tạo theo UUID, không prompt interpolation vào path.
- [ ] **Step 4:** Size null/model_default dùng release.defaultSize; asset có preset thì bắt buộc release.allowedSizes chứa đúng preset. Không đổi generationSize của asset hoặc silently chọn size khác. Steps/sampler cố định theo release.
- [ ] **Step 5:** Thêm `COMFYUI_ENABLED=false`, `COMFYUI_BASE_URL=http://127.0.0.1:8188`, `COMFYUI_TIMEOUT_SECONDS=900` ở env example/runtime anchor. Không đọc config bắt buộc ở module load/build; không yêu cầu Comfy config trên 9router path. Không tự sửa `.env`.
- [ ] **Step 6:** Source-review không secret/absolute local paths và không giả artifact; `npx tsc --noEmit` → exit 0. Registry chưa có release phải trả unavailable lý do rõ.

## Task 2: Server API adapter và read-only preflight

**Files:** client.ts, preflight.ts; consumes Task 1.

**Interfaces:**
- `ComfyOutput = { filename: string; subfolder: string; type: "output" }`.
- `Submission = { promptId: string; queueNumber: number }`.
- `PromptObservation = { state: "queued" | "running" | "completed" | "failed" | "missing"; output?: ComfyOutput; error?: string }`.
- `readCapabilities(config, release, signal): Promise<CapabilityReport>`.
- `submitPrompt(config, prepared, clientId, signal): Promise<Submission>` — đúng một POST.
- `observePrompt(config, promptId, preparedHash, outputNodeId, signal): Promise<PromptObservation>`.
- `downloadOutput(config, output, signal): Promise<Buffer>`.
- Typed error `ComfyRejectedError` chỉ cho validation rejection đã chứng minh chưa queue; mọi lỗi không rõ của POST khác là ambiguous.

- [ ] **Step 1:** Đối chiếu installed Comfy 0.43.2 server.py với repo chính thức tag v0.43.2: /prompt, /queue, /history/{id}, /view, object_info và system_stats. Ghi response keys được dùng trong docs, không suy từ ví dụ cũ.
- [ ] **Step 2:** Implement fetch wrapper timeout: GET 10s, POST 30s, file 60s và overall abort; redirect:error, bounded JSON body 2 MiB, không automatic POST retry. Error không echo body/graph/credential; response parsing chặt.
- [ ] **Step 3:** preflight check enabled/config, expectedComfyVersion bằng version exact của release, mỗi required class/input và model filename có trong loader. System API không chứng minh hash model remote: hiển thị model hash là release attestation, không gọi là runtime-verified hash.
- [ ] **Step 4:** POST body chỉ prompt, client_id UUID app tạo và extra_data correlation nếu verified route hỗ trợ. Không gửi client-specified prompt_id trong pilot; có field này không chứng minh dedup. Structured validation failure đúng shape/version được phép definite rejection; mọi transport/malformed response/5xx giữ ambiguous.
- [ ] **Step 5:** observe bằng prompt_id đã durable; không chọn output theo filename gần giống. Require exactly one image ở declared SaveImage node, queue/history identity khớp graph hash/correlation khi có dữ liệu, terminal failure phải có bằng chứng status error. Missing không failed-safe-to-resubmit.
- [ ] **Step 6:** Download cùng endpoint /view bằng URLSearchParams, path segments từ chối absolute/dot/dotdot/backslash/NUL/drive prefix; type output only. Bound streaming 25 MiB cả khi thiếu Content-Length; sharp input pixel limit 16M, PNG/signature+decode/dimensions kiểm sau download. Raw bytes không được public trước validate.
- [ ] **Step 7:** Source-review five Review Focus boundaries; `npx tsc --noEmit` và `npm run lint` → exit 0. Không gọi POST để xác minh trong bước này.

## Task 3: Durable runs, enqueue/resume và common locking

**Files:** schema.ts, runs.ts, generation-lock.ts, queue/jobs.ts, generated migration artifacts.

**Interfaces:**
- `VariantKey = { assetId: string; state: string }`.
- `withVariantGenerationLock<T>(key: VariantKey, fn: () => Promise<T>): Promise<T>`; `withComfyExecutorLock<T>(fn: () => Promise<T>): Promise<T>`.
- `requestComfyVariant(input: { assetId: string; state: string; workflow: WorkflowRef; feedback?: string; rejectedVariantId?: string }): Promise<{ runId: string; jobRunId: string }>`.
- `resumeComfyRun(input: { runId: string; expectedUpdatedAt: string }): Promise<void>`; `abandonComfyRun(input: { runId: string; expectedUpdatedAt: string; note: string; workerStopped: true; upstreamChecked: true }): Promise<void>`.
- `listAssetComfyRuns(assetId): Promise<ComfyRunView[]>` sanitized view; transition helpers use run/owner/currentness checks, never metrics source of truth.
- `requeueJobInTransaction(tx, jobRunId, type, payload, target): Promise<void>` only failed owner with no live delivery; row lock jobRuns, same type/target, send same owner ID and update queued/msgId. No replacement comfy run/jobRunId.

- [ ] **Step 1:** Định nghĩa bảng `comfy_image_runs`: UUID id, jobRunId unique FK restrict, variantId FK restrict; state text CHECK; inputSnapshot JSONB validated contract (prompt/seed/size/style/description/ref/graph/node output/model provenance/endpointHash/clientId); promptId nullable; rawArtifact and processedArtifact JSONB `{path,sha256,bytes,width,height}` nullable; error, note, createdAt, updatedAt, resolvedAt. Index variantId+createdAt và active partial unique variantId states prepared/submitting/submitted/uncertain. FK restrict giữ lịch sử; không đổi cascade asset ngầm để xóa runs.
- [ ] **Step 2:** Advisory protocol: dedicated `getPool().connect()` client, pg_try_advisory_lock bigint key derived deterministic from assetId+state; nonblocking busy error. Same connection acquire/unlock in finally; client.release(true) nếu unlock/connection lỗi. Short xact commands dùng cùng key via pg_try_advisory_xact_lock, không deadlock chờ session. Dedicated client error aborts protected work. Thứ tự: executor lock (worker Comfy only), variant advisory, asset row, variant row, comfy run row, job row. Không BEGIN xuyên HTTP; worker giới hạn 1 Comfy, chiếm tối đa 2 pool clients cho executor+variant.
- [ ] **Step 3:** request transaction khóa đúng owner/variant, validate allowed state/base eligibility và status, reject generating/active Comfy/queued or running existing asset image jobs. Upsert variant row an toàn để có FK khi state mới, freeze imagePrompt dựa asset/style/feedback/release/size, random seed + clientId trước enqueue. enqueueJobInTransaction `asset.comfy_image` payload `{version:1,runId}` và insert prepared run cùng transaction; reserve generating ngay. Rejection review/status phải atomic với reservation nếu reject-and-generate. Không network trong transaction.
- [ ] **Step 4:** Common variant session lock phải được dùng quanh legacy renderVariant cả khi job cũ không có backend. Nó check active/unresolved run trước đổi status/file và trước publish. Reservation không vượt qua legacy đang nắm lock; enqueue trước migration/worker rollout bị chặn theo documented rollout. Đừng giữ lock outer Comfy rồi gọi helper tự acquire lại connection khác.
- [ ] **Step 5:** Resume chỉ run submitted hoặc run có artifact có thể tiếp tục, job owner failed/không active, optimistic updatedAt và queueMsgId hiện hành. submitting/uncertain không tự resume POST: chỉ read-only reconciliation hoặc abandon. Abandon require confirmations/note, lock/currentness, state conditional, set variant failed nếu vẫn owned; run late publish phải fail. Nếu job vẫn running thì từ chối abandonment cho tới operator dừng worker/xử lý queue; không tự stop/interrupt upstream.
- [ ] **Step 6:** Generate `npm run db:generate` sau code schema; đọc SQL/snapshot/journal, chỉ một migration mới additive; không áp dụng. Pending 0015/0016 Automation không được silently migrate. `npx tsc --noEmit`, `git diff --check` → exit 0.

## Task 4: Worker execution, recovery và immutable artifacts

**Files:** comfy-image-jobs.ts, asset-jobs.ts, handlers.ts, queue/jobs.ts; consumes Tasks 1–3, existing imagePrompt/keyAndTrim/toPng/storage.

**Interfaces:**
- `generateComfyImage: JobHandler` registered as `asset.comfy_image`.
- `generateBase(payload, ctx?: JobContext)` và `generateVariant(payload, ctx?: JobContext)` giữ tương thích caller algorithm hiện tại; Comfy đi handler riêng, không gọi LLM proposal.
- Run artifact paths `assets/<assetId>/comfy/<runId>/source.png` và `image.png`; final variant.filePath trỏ image.png, không dùng `<state>.png` cho Comfy.

- [ ] **Step 1:** Validate payload/run ownership jobRunId, asset/variant còn tồn tại, backend/ref/endpoint identity immutable. succeeded returns recorded metrics ngay, không upsert variant generating; abandoned/stale không publish. prepared chỉ được submit từ state CAS và owner hiện hành.
- [ ] **Step 2:** Acquire executor then variant lock; singleton busy có thể DeferredJobError(10) trước HTTP. Active global unresolved submitting/submitted/uncertain run khác cũng ngăn generation mới sau worker crash (session lock đã mất không chứng minh Comfy idle). Không cho one-per-variant constraint trở thành cách chạy nhiều upstream jobs unresolved.
- [ ] **Step 3:** Bắt đầu heartbeat every20s extendLock(300), không overlapping; await initial lock extension trước paid/compute work. Abort trên heartbeat/client error và dùng current state CAS trước submit/publish. finally clear timer, await in-flight heartbeat, unlock/release. Không global interrupt.
- [ ] **Step 4:** Preflight prepared, persist submitting trước đúng một POST; response accepted lưu promptId submitted ngay. Không lưu được response hoặc crash ở submitting → uncertain khi lần sau nhận; tuyệt đối không submit lại. Definite validation rejection → failed/variant failed only owner. Ambiguous → uncertain và PermanentJobError để runner không resubmit.
- [ ] **Step 5:** submitted poll GET every2s, GET failure retry backoff tối đa10s trong overall deadline; timeout giữ submitted + PermanentJobError, UI cho tiếp tục theo dõi run cũ. Missing/history cleared giữ unresolved, không infer thất bại. Known terminal upstream error → failed; không tự sinh mới.
- [ ] **Step 6:** Persist validated raw artifact atomically trước hậu xử lý; nếu file đã tồn tại sau crash thì verify bytes/hash/dimensions rồi record/reuse; không overwrite mismatch. Xử lý bg→toPng, còn lại→keyAndTrim; persist immutable processed artifact. Download/postprocess errors giữ submitted + durable artifacts và có thể để runner retry safe; hết attempts UI resume same run.
- [ ] **Step 7:** Publish transaction locks theo Task3, state submitted, run owner/current active, variant còn generating, raw source width/height đúng snapshot. Update filePath/dimensions/source dimensions/prompt/pending_review và run succeeded atomic. Base existing asset chuyển pending_review nếu vẫn đúng owner; late run không sửa asset approval. Metrics provenance từ run, không update run từ metrics.
- [ ] **Step 8:** Refactor legacy renderVariant giữ processing hiện tại nhưng common lock+active guard chạy trước insert/update và publish; errors conflict không được catch rồi set variant.failed của Comfy. Legacy approved/succeeded duplicate safeguards chỉ trong phạm vi cần ngăn xung đột, không viết lại toàn pipeline.
- [ ] **Step 9:** Source-walk crashes tại mỗi persistence boundary cho Review Focus1–4; `npx tsc --noEmit`, `npm run lint` → exit 0. Không gửi generation tự chứng minh.

## Task 5: Backend UI, approval guard và reconciliation

**Files:** asset-actions.ts, request-variant-form.tsx, variant-review.tsx, new picker/panel và asset page.

**Interfaces:**
- Form request fields backend, workflowId, workflowRevision, workflowHash; không graph/URL/seed path từ client.
- Server actions `resumeComfyImage`, `abandonComfyImage`, `inspectComfyImage` nhận runId và expectedUpdatedAt. inspect chỉ GET queue/history, không submit; nếu promptId chưa có, chỉ bind ID khi unique correlation+graph xác minh khớp, không theo file name.
- ComfyRunView exposes runId/promptId/state/ref/model/dimensions/timestamps/error/safe artifact status, không raw graph/private paths/endpoint credentials.

- [ ] **Step 1:** requestVariant/rejectVariant/retryVariant parse versioned choice và validate server registry. Thiếu backend ở legacy form vẫn9router. Comfy mới dùng Task3 reservation; 9router action cũng phải common advisory+xact guard và check active run. Reject giữ reviews và feedback; không reject rồi enqueue ở transaction khác.
- [ ] **Step 2:** approveVariant guard trong same transaction khóa variant, kiểm không unresolved/generating, rồi đổi statuses/reviews atomically. Sau commit gọi casting/algorithm hooks như cũ; hook failure không được coi chưa approve rồi lặp generation. Không thay ownership series.
- [ ] **Step 3:** Picker controlled với hidden input values theo React19 reset rule. 9router default cho yêu cầu mới; Comfy disabled khi flag false/registry rỗng với lý do. Sau chọn Comfy hiển thị workflow/model/size và yêu cầu quyền chạy tường minh.
- [ ] **Step 4:** VariantReview phân biệt “Tiếp tục theo dõi/tải kết quả” giữ backend/run cũ và “Tạo lượt sinh mới” phải terminal/unresolved-free, lựa chọn backend tường minh. Nút retry cũ không được biến submitted/uncertain thành Comfy POST mới. Request base chỉ dùng khi existing base failed/rejected/pending_review đúng command, không regenerate base approved.
- [ ] **Step 5:** Panel provenance + status + inspect/resume/abandon confirmations/note. Render asset page load runs một lần, chỉ current owner relation asset/series. AutoRefresh chỉ active queued/running, không poll page mãi với uncertain/failed cần quyết định. Với flag false, persisted run info/reconciliation đọc vẫn có thể hiển thị nhưng không submit/generation mới.
- [ ] **Step 6:** Source review two-tab/action rollback/old job cases (Review Focus2–4). `npx tsc --noEmit` và `npm run lint` → exit 0. Không mở app/runtime tự kiểm.

## Task 6: Workflow handoff, rollout và verification

**Files:** docs/comfyui-pilot.md, README.md, CLAUDE.md; actual workflow/manifest chỉ sau operator cung cấp artifact.

- [ ] **Step 1:** Viết runbook cấu hình, empty registry fail-closed, release API export + UI workflow copy, node/model/hash/license provenance và version compatibility; official model source không đồng nghĩa permission download/generation. Không hardcode model chưa chọn.
- [ ] **Step 2:** Workflow handoff gate: operator cung cấp API graph, model filename/hash/source/license và kết quả local nghiệm thu. Review graph core nodes/allowlist/input mappings/output/size, graph canonical hash và dependency versions; chỉ register release sau đủ thông tin. Nếu artifact chưa có, hoàn thành foundation/static only, giữ Comfy unavailable; không claim pilot complete hoặc fabricate manifest.
- [ ] **Step 3:** Document rollout: dừng/loại worker cũ bằng quyền riêng; rà pending migrations đầy đủ; operator approve migrate scope; deploy compatible app/worker trước enqueue. Không chạy db:migrate vì tưởng chỉ apply migration Comfy. Không tự cài/download/start.
- [ ] **Step 4:** Hướng dẫn connection check từ đúng worker environment; Docker→Windows loopback cần kiểm riêng, không mặc định dùng được host.docker.internal, không tự mở listen/public firewall. Chẩn đoán chỉ gửi health/node GET và không expose endpoint tới browser.
- [ ] **Step 5:** Final source self-review spec coverage; whole-change fresh reviewer theo execution method đã chọn, một fix pass và ghi deferred concerns. Reviewer không test/runtime/generation. Nếu provider reviewer không khả dụng, report blockage hoặc dùng model được catalog xác nhận, không giả review thành công.
- [ ] **Step 6:** Run fresh `npx tsc --noEmit`, `npm run lint`, `git diff --check`, `npm run build`; đọc output/exit từng lệnh. Build là Next static compatibility, không chứng minh Comfy GPU hoặc media runtime. Không sửa deps unrelated audit findings.
- [ ] **Step 7:** Handoff static result, generated-unapplied migration, missing workflow/model và remaining permissions. Không commit/push trừ user yêu cầu riêng; nếu sau này commit, explicit paths và Conventional Commits theo AGENTS.

### Manual acceptance — CHỈ khi user cho phép riêng

Không chuyển checklist này thành test scripts/files.

1. Config off/registry empty/unknown ref/hash mismatch/missing node/model → báo lý do, không POST; luồng 9router không cần Comfy online.
2. Một existing bg variant, rồi một existing chr/prop variant trên nền xanh: batch1, source size khớp, file local immutable, trim đúng và pending_review; approve kích hoạt binding cũ.
3. Reject feedback → một new run; retry download/postprocess và worker redelivery succeeded không tạo ảnh GPU mới hoặc hạ approved.
4. Worker chết sau POST/response/durable prompt ID/download/publish: kiểm state và không duplicate POST; submitting mơ hồ giữ uncertain.
5. Mất history/timeout/Comfy stopped/mất DB lock → giữ unresolved, không auto interrupt/retry generation; resume same prompt ID khi có thể.
6. Hai tab request/approve/reject và queued legacy9router job cùng variant → một active owner; không ghi đè run mới. Abandonment ghi note, late result không publish.
7. API output wrong node/type/path, redirect/over25MiB/over16Mpixel/wrong size → reject, không public raw.
8. Đo thời gian queue/generation/download/process, kiểm ảnh bằng mắt; không benchmark throughput trước khi có số liệu. Mọi gọi 9router trong acceptance cần budget permission tương ứng.

## Self-review và dependency gates

- Spec sections1–4 → Tasks1–2; section5 → Tasks3–4; section6 → Task5; sections7–10 → Task6/global constraints.
- Review Focus5 cases đều có task owner và manual acceptance, nhưng không có behavioral proof khi chưa runtime-authorized.
- Definitions ở Task1→client Task2→run Task3→worker Task4→UI Task5 đồng nhất; riêng asset.comfy_image là new job type để bảo vệ retry semantics mà không silent change jobs cũ.
- Unknown model/workflow và worker network là explicit enablement gates, không thiết kế schema/code bằng placeholder output giả.
- Spec status được cập nhật đúng approval, không coi plan được duyệt vì user đã duyệt spec.

## Nguồn đối chiếu

- https://docs.comfy.org/development/comfyui-server/comms_routes
- https://docs.comfy.org/development/api-development/workflow-api-format
- https://raw.githubusercontent.com/Comfy-Org/ComfyUI/v0.43.2/server.py — route chấp nhận client_id/extra_data, queue.put sau validation; không dedup guarantee từ optional prompt_id.
- https://orm.drizzle.team/docs/transactions — atomic callback/savepoint, không suy exact TypeScript types từ ví dụ.
- https://www.postgresql.org/docs/current/explicit-locking.html — session advisory lock lifetime/unlock; không dùng pool release thay unlock.
- Local source package/queue/schema/client/asset actions/UI/worker được đọc để xác định signatures; docs/latest không thay thế installed version types.

Context7 không có tool ở bounded lookup; dùng official docs + targeted source reading theo quyền thay thế đã cấp. Không hiểu graph rộng hoặc thêm dependency không cần thiết.
