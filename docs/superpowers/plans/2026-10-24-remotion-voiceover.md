# Remotion Voiceover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Triển khai inline theo phương thức đã chọn trong session; không delegate implementation. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Bản đầu hỗ trợ upload giọng và tạo giọng AI, duyệt bản thu, chỉnh timeline và xuất video có tiếng bằng pipeline production hiện tại.

**Architecture:** Audio take là file bất biến độc lập với asset ảnh. VoiceoverTimelineV1 đặt clip trên timeline toàn video; preview và render dùng chung component. Queue tạo TTS trước render; render khóa phiên bản và hash của scene/timeline/audio ngay khi enqueue.

**Tech Stack:** Next 15.5.28, React 19.1.0, Remotion 4.0.537, Mediabunny 1.61.6, Drizzle ORM 0.45.4/kit 0.31.11, PostgreSQL/Supabase local, pgmq và 9router endpoint hiện có. Docker Node 22 Alpine app/Bookworm worker.

**Spec:** [2026-10-24-remotion-voiceover-design.md](../specs/2026-10-24-remotion-voiceover-design.md), user đã duyệt ngày 2026-10-24. **Plan đã được user duyệt riêng và triển khai inline. Tasks1–5 implemented; static/build checks passed, live audio acceptance chờ smoke riêng.** Chi tiết: `docs/DangLee_ImplePlan/REMOTION_VOICEOVER_REPORT.md` và ignored ledger.

## Global Constraints

- Cả upload và AI TTS thuộc bản đầu; catalog TTS rỗng chỉ là prerequisite chưa đạt, không được bỏ TTS khỏi nghiệm thu.
- Giữ SceneDSL v1/ScriptDSL v1, pipeline gốc, ảnh/state và motion hiện tại. Không triển khai lipsync/STT/voice clone/music/SFX/waveform.
- 30 fps; video 1920×1080; scene tối đa 900 frame; upload MP3/WAV PCM ≤25 MiB và ≤600 giây; không video/multiple audio tracks; TTS text 1..5.000 ký tự hoặc giới hạn model thấp hơn.
- ≤64 clip/video; ≤4 active đồng thời; playbackRate=1; gain 0..1; default fades=0; default allowOverlap=false. Thời gian là frame nguyên, khoảng nửa mở.
- Take/timeline đã duyệt bất biến; sửa tạo version/take mới. Timeline stale không render; không tự lùi về approved cũ hoặc bỏ lời khi lỗi.
- Không viết/sửa/chạy formal tests, fixture/mock hoặc test runner theo AGENTS §4–6. Lint/tsc/build được phép; các manual smoke ở cuối là đề xuất, cần quyền riêng trước model/render.
- Không commit/push, không reset DB, không sửa migration cũ, không đưa secret vào source/artifact/log. Bảo toàn dirty baseline và junction data hiện có.
- Kiểm tra Context7 trước và nguồn chính thức đúng version khi cần dùng thêm API ngoài nguồn đã xác minh trong spec §8. Không tự nâng package.

## Review Focus

1. TTS timeout/redelivery/double-submit không gây thêm outbound synthesis tự động (Task 3).
2. Audio vượt source/video, fade ngắn và overlap tại ranh giới frame bị validate đúng; preview/export không cộng offset hai lần (Task 1, 4).
3. Thay scene/take/latest timeline giữa enqueue và worker phải fail trước render thay vì lấy latest mới (Task 5).
4. Upload sai định dạng/oversize/multiple tracks và HTTP Range khi seek phải có lỗi rõ ràng (Task 2).
5. Người dùng chọn silent rõ ràng; legacy silent vẫn chạy; lỗi audio không tạo MP4 thành công thiếu tiếng (Task 4–6).

Đây là tiêu chí review/manual verification, không cho phép viết hoặc chạy test tự động.

## File map

| Phần | File mới | File sửa |
|---|---|---|
| Contract/timing | `src/lib/audio/types.ts`, `schema.ts`, `timing.ts`, `fingerprint.ts` | Không sửa scene/script schema |
| Persistence | `src/lib/audio/repository.ts`, `queries.ts` | `src/lib/db/schema.ts`, migration kế tiếp và metadata |
| Upload/probe | `src/lib/audio/files.ts`, `probe.ts`; `src/app/api/designs/[id]/audio/upload/route.ts` | files route, package/lock |
| TTS | `src/lib/ninerouter/tts.ts`; `src/worker/audio-jobs.ts` | queue jobs, worker handlers, `.env.example` chỉ nếu cần ghi chú |
| UI/actions | `src/app/designs/[id]/voiceover/page.tsx`; `src/app/audio/actions.ts`; `src/components/audio/{voiceover-editor,take-list,video-player}.tsx`; `src/remotion/VoiceoverTrack.tsx` | design-tabs, VideoComposition |
| Render | `src/lib/render/input.ts`; `src/lib/audio/render-snapshot.ts` | render actions/UI/page, render-jobs |

Các đường dẫn rút gọn `schema.ts`, `queries.ts`, … ở cùng thư mục đầu hàng. Không thêm file `*.test.*`/`*.spec.*`.

### Task 1: Contract, timing và persistence

**Interfaces**

- `VoiceoverClip`: `id:UUID`, `takeId:UUID`, `from:number`, `trimBefore:number`, `durationInFrames:number`, `volume:number`, `fadeInFrames:number`, `fadeOutFrames:number`, `allowOverlap:boolean`, `label:string`, `speakerRef?:string`.
- `VoiceoverTimelineV1 = {version:1;fps:30;visualFingerprint:string;clips:VoiceoverClip[]}`. Timeline DB `version` là revision counter, khác contract version=1.
- `AudioSourceMeta = {filePath:string;sha256:string;bytes:number;durationSeconds:number;sampleRate:number;channels:number;codec:string}`.
- `validateVoiceover(timeline:unknown, sources:Record<UUID,AudioSourceMeta>, videoFrames:number): {ok:true;timeline:VoiceoverTimelineV1}|{ok:false;issues:string[]}`.
- `clipGain(clip:VoiceoverClip, globalFrame:number):number`; `mixedGains(clips:VoiceoverClip[], globalFrame:number):Record<UUID,number>`.
- `visualFingerprint(input:VisualSnapshot):string`, `timelineHash(timeline:VoiceoverTimelineV1):string`; canonical JSON stable-key serialization, SHA256, cùng helper ở approve/enqueue/worker.
- `VisualSnapshot`: approved script ID/version/content hash; ordered scenes `{id,position,dslHash,durationFrames}`; fps/width/height. Đây là fingerprint nội dung, không dùng timestamp dễ thay đổi.

- [x] Đọc lại spec và ghi ledger `.superpowers/sdd/2026-10-24-remotion-voiceover/progress.md`: branch/HEAD, dirty baseline, versions, approval, Docker/DB prerequisites. Dùng worktree hiện hữu; không giả định worktree mới mang theo uncommitted assets/code.
- [x] Tạo types và Zod strict schema. Validate UUID/unique clip IDs, số finite/integer, số clip, source bounds `floor(durationSeconds*30)`, video bounds, fade sum và overlap đúng spec. Split tại frame k: clip phải chia thành hai đoạn nguồn liên tiếp, không reset source trim; duplicate cần ID mới và validate lại placement.
- [x] Timing: local=`globalFrame-from`; ngoài `[0,duration)` gain=0. Fade-in nếu >0: `min(1,local/fadeInFrames)`; fade-out nếu >0: `min(1,(duration-1-local)/fadeOutFrames)`; clamp ≥0, nhân volume. Fade=0 bỏ thừa số đó. Với các gain hoạt động g, output từng clip = `g/max(1,sum(g))`.
- [x] Schema DB theo spec §5: audio_takes, voiceover_timelines, target_type thêm 2 giá trị, renders thêm 2 cột nullable. Dùng text+check cho source upload/tts; double precision durationSeconds; bigint bytes theo convention number an toàn trong giới hạn 25 MiB. Metadata bắt buộc khi pending/approved; source tts phải có text/model snapshot. Unique requestId, unique(videoId,version), FK/index videoId và timeline render.
- [x] Repository tách thao tác: `createUploadTake`, `createTtsTake` (take+enqueue cùng transaction), `approveTake`, `rejectTake`, `saveTimelineVersion`, `approveTimeline`, `rejectTimeline`. Status transitions conditional trong transaction và insert review cùng transaction. Save revision dùng khóa video row để cấp max(version)+1; submit mang expectedLatestVersionId, mismatch báo refresh. Mọi take/timeline ID phải thuộc video hiện hành. Approval timeline kiểm tra latest, fingerprint, scene approval, take approval và hash file; không đổi schema scene/script.
- [x] Đọc journal trước generate migration (hiện cuối 0003); dự kiến `drizzle/0004_remotion_voiceover.sql` + snapshot/journal. Review diff chỉ additions đã duyệt; tránh sử dụng ngay enum value mới trong cùng transaction nếu PostgreSQL yêu cầu commit trước. Chưa apply lên DB khi plan chưa được duyệt.
- [x] Khi triển khai được duyệt: backup local DB vào ignored ledger, ghi migration history/counts, apply theo runner hiện có, kiểm lại bảo toàn rows cũ và nullable render columns. Không reset/reseed. Kiểm tra kiểu `npx tsc --noEmit`; review boundary cases theo Review Focus 2.

### Task 2: Upload, đo audio và phục vụ file

**Interfaces**

- `probeAudio(bytes:Uint8Array, declaredMime:string):Promise<Omit<AudioSourceMeta,'filePath'|'sha256'>>` chỉ chấp nhận MP3 hoặc PCM WAV, đúng 1 audio track, 0 video track; dispose parser trong finally.
- `storeTakeAudio(takeId:string, bytes:Uint8Array, meta:Omit<AudioSourceMeta,'filePath'|'sha256'>):Promise<AudioSourceMeta>` tự tính SHA256 và dựng path `audio/takes/<uuid>/source.mp3|wav` theo codec đã probe; ghi atomic và không nhận đường dẫn từ client.
- `POST /api/designs/:id/audio/upload`: request body **raw bytes**, headers `Content-Type`, `X-Audio-Request-Id:UUID`, `X-Audio-Label` encoded URI (decode/validate max120), `X-Audio-Filename` encoded URI chỉ dùng kiểm tra extension, không làm path. Response 201 `{takeId,status:'pending_review'}`, replay cùng requestId/hash/video trả 200, khác bytes/video trả409; sai bytes/type413/415/422.

- [x] Thêm direct dependencies `@remotion/media@4.0.537`, `mediabunny@1.61.6`, cập nhật lock bằng npm, không nâng gói khác. Kiểm tra installed types và official source đúng versions cho Input/BufferSource/track metadata.
- [x] Probe bounded buffer bằng Mediabunny trên server Node; đo duration/sample rate/channels/codec/container và kiểm allowlist. Extension nhận `.mp3`/`.wav`, MIME MP3 `audio/mpeg` hoặc `audio/mp3`, WAV `audio/wav` hoặc `audio/x-wav`; lưu MIME canonical. WAV chỉ integer PCM (không float/compressed). Giới hạn time probe 30s, cleanup parser và buffer; không dựa ffprobe host.
- [x] Route stream-read request.body với cap byte thực 25*1024*1024, reject Content-Length lớn sớm, vẫn đếm thực; Node runtime. Chọn raw body để không buffer multipart trước khi áp cap. Client fetch File trực tiếp, không server action/FormData cho bytes. Kiểm Origin cùng app cho mutation browser; reuse access rules hiện hành, không tự thêm mô hình auth/cloud.
- [x] Dựng UUID/path server, hash SHA256, claim request ID chống double-submit; cùng ID đang xử lý trả409 in_progress, không tạo take thứ hai. Probe trước publish pending_review; lỗi sau claim đánh dấu take failed và cleanup partial file. Không ghi đè source đã tồn tại/đã duyệt.
- [x] Files route thêm MIME canonical MP3/WAV; giữ streaming/Range206/416 và auto HEAD của framework nếu đang dùng. Kiểm tra semantics Next15.5 chính thức trước thay handler; không refactor file service.
- [x] `npm run lint`, `npx tsc --noEmit`. Trong smoke được duyệt sau này, kiểm tra seek, valid MP3/WAV, bytes oversize dù Content-Length thiếu/sai, file giả extension và file lỗi; không tạo fixture/formal test.

### Task 3: Discovery và queued TTS qua router chung

**Interfaces**

- `listTtsModels():Promise<TtsModelOption[]>`, `getTtsVoices(modelId:string):Promise<TtsVoiceOption[]>`, `synthesizeSpeech(input:{modelId:string;text:string;timeoutMs?:number}):Promise<Uint8Array>` trong `ninerouter/tts.ts`.
- `TtsModelOption = {id:string;label:string;maxCharacters?:number;requiresVoice:boolean}`; `TtsVoiceOption = {id:string;label:string;wireModelId:string}`. Dùng modelId=wireModelId hoàn chỉnh khi submit; lưu model/voice metadata snapshot bên take.
- Job `audio.generate`, payload `{takeId:string}`, target audio_take. `generateAudio(payload:JobPayload,ctx:JobContext):Promise<Record<string,unknown>>`.

- [x] Reuse NINE_ROUTER_BASE_URL/API_KEY server-only bằng helper config dùng được cả Next/worker; không sửa request body/image size behavior hiện có. Discovery GET timeout15s, cache tối đa60s, nút refresh explicit. Parse response runtime; lỗi/rỗng không cho synthesize. voicesUrl chỉ same-origin router, path trong API đã xác minh; reject redirect ra origin khác và không gửi key ngoài router.
- [x] Đối chiếu official live/provider metadata để resolve model+voice đúng wire format, không arbitrary model client. Provider metadata chưa đủ → disable option kèm lý do; không đoán voice mặc định. Endpoint GET read-only có thể gọi khi triển khai; POST synthesis chỉ do user bấm tạo/đã duyệt smoke.
- [x] Implement POST `/audio/speech?response_format=mp3` với text/model đúng contract; timeout120s, cap response25MiB, giới hạn600s như upload, probe/hash/store trước pending_review. HTTP error chỉ status + safe category; không log raw body/auth. Không tự retry HTTP client hoặc chọn provider khác.
- [x] Tạo take+job một transaction, unique requestId và video ownership. Replay requestId cùng video/text/model trả take hiện hữu; khác nội dung trả conflict, không enqueue thêm. Handler conditional update `synthesisStartedAt IS NULL` claim trước outbound. Nếu đã có file+metadata hợp lệ thì return saved result; nếu started chưa có result thì PermanentJobError không gửi POST lần nữa. Mọi thất bại synthesis là permanent cho take này; error ngoài handler trước/giữa DB operations phải để redelivery đi qua claim, không bypass claim. Extend queue lease khi xử lý lâu. UI lấy lỗi synthesis từ job_runs.error đã redact; không tự bổ sung cột DB ngoài spec.
- [x] Đăng ký job trong queue/handlers, không đổi retry policy của job ảnh/scene. UI tạo lại bằng requestId/take mới và user action rõ ràng; latest take không tự thay take đã đặt trong timeline.
- [x] `npm run lint`, `npx tsc --noEmit`; source review claim/redelivery/no-retry và secret redaction. Nếu catalog vẫn rỗng, ghi blocker vận hành; hoàn thành phần upload/UI nhưng không tuyên bố full feature đạt nghiệm thu.

### Task 4: UI lồng tiếng và preview chung

**Interfaces**

- `getVoiceoverEditor(videoId:string):Promise<VoiceoverEditorData|null>` trả video, scenes chuẩn bị preview, takes, latest timeline/status, fingerprint hiện hành và TTS availability.
- Actions nhận IDs/revision/requestId từ form, validate server; `requestTtsTake`, `reviewAudioTake`, `saveVoiceoverTimeline`, `reviewVoiceoverTimeline` trả FormState.
- `ResolvedVoiceover = {timeline:VoiceoverTimelineV1;sources:Record<string,AudioSourceMeta>}`; `VideoProps.voiceover?:ResolvedVoiceover`. Source filePath là relative path; component resolve URL/staticFile theo assetMode.
- `VoiceoverTrack({voiceover,assetMode,onAudioError?})`: global frame một lần, Audio.from=clip.from, trimBefore/duration nguồn theo contract, playbackRate=1, numeric mixed gain. Không wrap thêm offset cho audio. `onError` báo callback rồi return fail, không silently fallback.

- [x] Thêm tab/page `/designs/[id]/voiceover`; load takes sớm, chỉ bật duyệt timeline khi tất cả scene approved. Empty/missing-scenes state có chỉ dẫn về storyboard; không dựng placeholder scenes để vượt gate.
- [x] Form upload raw File theo Task2; form TTS text/model/voice theo Task3; lưu requestId ổn định khi retry submit cùng yêu cầu. Hiển thị pending/running/failed/ambiguous/pending_review/approved/rejected và audio player nghe take. TTS rỗng là banner cấu hình router; không hide flow.
- [x] Take review actions chỉ pending_review, reason reject ≥5 ký tự theo convention. Draft timeline chỉ chọn approved takes; nghe pending take qua player riêng. Không có autoapprove audio từ AI hoặc từ worker.
- [x] Editor danh sách tối đa64 clip: add/remove/split/duplicate, label/speaker, from/trim/duration/gain/fades/allowOverlap. Nhập frame hoặc giây→round(*30); server validate lại. Split không làm sai trim; client draft bẩn không mất khi action báo lỗi; latest revision mismatch giữ form và yêu cầu reload/merge thủ công.
- [x] Render full-video Player dùng VideoComposition hiện có + VoiceoverTrack optional. Không sửa SceneView/dialogue/talk-state. Draft clip changes preview ngay sau client validation; lưu/duyệt tạo version theo repository. Preview draft timeline chỉ dùng take đã duyệt.
- [x] Hiển thị trạng thái stale khi script/scene fingerprint đổi; review bắt buộc kiểm lại. UI gain normalization và overlap có giải thích dễ hiểu, không đưa hash/DB details vào thao tác thường ngày.
- [x] `npm run lint`, `npx tsc --noEmit`, `npm run build`. Review no-audio props và numeric gain tại clip boundaries; manual playback chỉ trong smoke riêng được duyệt.

### Task 5: Khóa input và tích hợp production video.render

**Interfaces**

- `loadRenderInput(videoId:string):Promise<{visual:VisualSnapshot;scenes:VideoProps['scenes'];imageFiles:{path:string;sha256:string}[]}>` trích kiểm tra script/scene/catalog hiện có, dùng chung cho fingerprint UI và render action/worker; không đổi tiêu chuẩn approved scenes.
- `RenderAudioRequest = {mode:'silent'}|{mode:'voiceover';timelineVersionId:string;timelineHash:string;takeHashes:Record<string,string>}`.
- `RenderRequestV1 = {version:1;renderId:string;videoId:string;visual:VisualSnapshot;visualHash:string;imageFiles:{path:string;sha256:string}[];audio:RenderAudioRequest}`.
- `prepareRenderRequest(videoId:string,selection:{mode:'silent'}|{mode:'voiceover';timelineVersionId:string}):Promise<RenderRequestV1>`; `snapshotRenderAudio(request:RenderRequestV1,publicDir:string):Promise<ResolvedVoiceover|undefined>`.

- [x] Render UI thêm lựa chọn explicit silent/voiceover version. Nếu latest timeline draft/stale, không tự lấy approved cũ; silent vẫn cho chọn rõ ràng. Server không nhận thiếu mode từ form mới. Giữ pipeline readiness của scene như hiện tại.
- [x] startRender lấy video row lock; chặn render generating trùng; verify selection/latest/approved/fingerprint/hash, tạo render row, lưu immutable `renders/<renderId>/request.json` và hash. Enqueue payload `{renderId,requestVersion:1,requestHash}` cùng transaction với render DB row. Orphan request file nếu transaction rollback không được job đọc hoặc tái dùng, không overwrite. Store voiceover_timeline_id và snapshot hash trong renders; mode silent có timeline ID null.
- [x] Worker nhận requestVersion1 đọc path do renderId server dựng, so requestHash, reload kiểm current scene/script/timeline/take statuses/hashes, kể cả source PNG hash; đổi sau enqueue → PermanentJobError trước bundle. Không thay bằng latest khác. File snapshot copy xong phải hash lại; render props chỉ dùng snapshot đã khóa.
- [x] Payload legacy chỉ có renderId tiếp tục silent path hiện tại, log/manifest `legacy-silent`, không tự tìm latest timeline. New malformed v1 payload fail, không rơi vào legacy để bỏ audio. Đây là tương thích queue cũ, không phải cách tạo request mới.
- [x] Copy audio source vào publicDir cùng ảnh, truyền voiceover optional vào VideoComposition. Audio mode chọn `audioCodec:'aac'` cùng H264/MP4 theo renderer4.0.537 docs/types; lỗi decode là render failed. Không ép audio track cho silent, không gọi TTS trong render.
- [x] Lưu manifest `renders/<renderId>/manifest.json`: immutable request + các hash snapshot, source/lock/package versions, duration frames, mode, output hash. Chỉ publish pending_review khi MP4 và manifest đều hoàn tất; retry render dùng cùng request, không reselect latest. Giữ lease/progress/storage cleanup hiện có.
- [x] `npm run lint`, `npx tsc --noEmit`, `npm run build`; khi Docker sẵn sàng `docker compose build app worker` theo service thực tế. Không chạy/render khi chưa được duyệt smoke. Source review race latest/source changes và failure paths; không coi build pass là chứng minh nghe đúng.

### Task 6: Review cuối và handoff để duyệt manual smoke

**Files:** ledger kể trên; tạo `docs/DangLee_ImplePlan/REMOTION_VOICEOVER_REPORT.md` khi triển khai, không tạo bằng chứng giả ở giai đoạn plan.

- [ ] Chạy `git diff --check`; ghi lint/tsc/build output và phiên bản; xem diff chỉ scope audio, bảo toàn inherited Docker/dimensions/Remotion/Boston changes. Không tự commit/push.
- [ ] Fresh reviewer kiểm toàn bộ implementation delta theo executing-plans; brief loại trừ dirty baseline, cấm test/model calls và tập trung 5 Review Focus. Fix Important/Critical trước handoff.
- [ ] Trình user **smoke scope cụ thể trước khi phát sinh job**: 1 file MP3/WAV user chọn; đúng1 TTS take với model/voice/text user duyệt; 1 production render có cả2 nguồn và narration qua scene boundary; tối đa1 silent render nếu chưa có bằng chứng tương thích phù hợp. Bấm review là quyết định của user, không tự duyệt take/timeline trong smoke nếu chưa được ủy quyền.
- [ ] Smoke proposal gồm upload sai/hỏng/quá giới hạn, duplicate request, clip bounds/fade/overlap, stale timeline và đổi input trước worker; chỉ manual thao tác thực, không viết/chạy formal tests. Nếu mô phỏng timeout có thể gây charge, không gọi live chỉ để gây lỗi; review nguồn claim/no-retry và báo giới hạn chưa quan sát trực tiếp.
- [ ] Khi được duyệt và đủ prerequisites, chạy đúng scope, ghi job IDs/attempts, approval provenance, manifest/hashes và encoded metadata; nghe preview/MP4 tại các mốc bắt đầu/cắt/scene boundary/kết thúc. Xác minh H264+AAC1920×1080@30fps, duration bằng tổng scene, không rơi mất lời. Không vượt số synthesis/render đã duyệt để tự sửa kết quả.
- [ ] Nếu TTS catalog rỗng, DB/Docker off, chưa có file giọng/approved scene, ghi blocker cụ thể và trạng thái phần đã verify. Chỉ đánh dấu full release PASS khi cả upload và TTS chạy qua production render được quan sát; không dùng Boston silent smoke thay bằng chứng.

## Self-review / approval boundary

- Spec §1–3 → constraints, Task1–4; §4 upload/TTS/timeline → Task2/3/4; §5 DB/reviews → Task1; §6 reproducibility → Task5; §7 nghiệm thu → Task6. Không bỏ nguồn TTS khỏi bản đầu.
- Types/timing/hash helpers chỉ có một định nghĩa; VideoProps optional để legacy silent; schema scene/script không đổi. Frame envelope và source trim thống nhất giữa preview/export.
- Không file test, không command test, không model/render/migration invocation trong giai đoạn planning. Official references và version evidence nằm tại spec §2/8; implementation phải kiểm tiếp API types trước khi dùng.
- Plan đã được user duyệt và triển khai inline; không hỏi chọn lại phương thức. Smoke live/model/render vẫn cần scope riêng như spec đã duyệt; không suy ra approval smoke từ approval implementation.
