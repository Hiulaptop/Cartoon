# Lồng tiếng Remotion — thiết kế bản đầu

Trạng thái: **THIẾT KẾ ĐÃ ĐƯỢC USER DUYỆT ngày 2026-10-24** bằng “duyệt” sau khi trình tài liệu. User đã duyệt implementation plan riêng; code/migration/dependencies đã triển khai. Chưa gọi TTS/render hoặc nghiệm thu audio live. Ngày khảo sát: 2026-10-24.

## 1. Mục tiêu và quyết định của user

Tích hợp lồng tiếng vào pipeline gốc của Cartoon, giữ Remotion để ghép và xuất video. **Ngay bản đầu có cả upload file giọng có sẵn và tạo giọng AI từ văn bản.** Hai nguồn cùng đi qua nghe thử → duyệt bản thu → xếp timeline → preview → render có tiếng.

Không cần khớp miệng chính xác; có thể narration. Giữ ảnh/state nhân vật hiện có. Không thêm Rhubarb, ComfyUI, AnimatedDrawings hoặc pipeline tạo chuyển động khác.

Các lựa chọn do agent đề xuất và nằm trong thiết kế user vừa duyệt: lưu audio theo design/video; timeline tuyệt đối cấp video; MP3/WAV cho upload đầu tiên; TTS qua endpoint 9router chung; tốc độ phát cố định 1.

## 2. Hiện trạng đã đối chiếu source

- `package.json`/lock: Next 15.5.28, React 19.1.0, Remotion/player/renderer/bundler **4.0.537**. `@remotion/media` 4.0.537 và Mediabunny **1.61.6** đã có transitively, chưa là direct dependencies. Nếu dùng trực tiếp phải khai báo đúng các phiên bản này khi implementation được duyệt.
- Dockerfile: app Node 22 Alpine, worker Node 22 Bookworm. Không giả định ffprobe của Windows có trong container; phương án metadata bên dưới không cần CLI hệ thống.
- `src/lib/scene/schema.ts`: SceneDSL v1 strict; dialogue gồm speaker/text/from/to, không phải audio. Giới hạn cảnh 900 frame, 30 fps, 1920×1080.
- `src/remotion/SceneView.tsx`: phụ đề và talk-state, chưa có audio. `VideoComposition.tsx` ghép cảnh bằng offset tích lũy. `scene-player.tsx` chỉ preview từng SceneView, chưa là preview toàn video.
- `src/worker/render-jobs.ts`: snapshot asset ảnh → bundle → selectComposition → renderMedia. Đây là đường tích hợp production, khác smoke Boston dùng composition riêng.
- `src/app/api/files/[...path]/route.ts`: có Range, chưa khai báo MIME MP3/WAV.
- DB có review status, reviews và queue dùng chung; `asset_kind` chỉ là ảnh, `target_type` chưa có audio. Không nhét audio vào asset ảnh.
- Graph `.ua` ở checkout gốc đã được tham khảo; graph từ 2026-10-22 nên source hiện tại là căn cứ cho các thay đổi chưa commit.
- Docker Engine không kết nối được trong phiên khảo sát này. Không xác nhận app/DB đang chạy. Read-only GET `/v1/models/tts` từ host, dùng credential riêng trong `.env`, trả HTTP 200, `{object:"list",data:[]}`. Đây là **chưa có model TTS được endpoint công bố**, không chứng minh mọi provider đều không hỗ trợ TTS.

## 3. API Remotion phù hợp

Theo tài liệu chính thức gắn tag 4.0.537:

- `Audio` từ `@remotion/media`: component được Remotion khuyến nghị; phát/trộn audio có sẵn, không tự sinh giọng.
- `src`, `staticFile()`: preview dùng URL cùng origin; render dùng file trong public snapshot.
- `from`: frame bắt đầu trên timeline cha. `trimBefore`: bỏ đầu nguồn. `durationInFrames`: số frame **nguồn** được chọn; thời lượng đầu ra là giá trị này / playbackRate. Dùng playbackRate=1 để hai đơn vị trùng nhau trong v1.
- `volume` + `useCurrentFrame()` + `interpolate()`: gain và fade theo frame; dùng giá trị volume numeric. Không dùng `trimAfter` đã deprecated hoặc callback volume không còn được khuyến nghị.
- `Sequence` vẫn có trong renderer hiện tại; không refactor phần ghép cảnh trong tính năng audio. Audio cấp video dùng timing props trực tiếp, tránh cộng offset hai lần.
- `Html5Audio` từ `remotion`: phương án HTML5 có sẵn; không chọn làm đường chính. Với `Audio`, lỗi decode phải hiển thị/fail rõ ràng, không âm thầm xuất video thiếu lời.
- Mediabunny `Input` + `BufferSource`, `computeDuration()`, `getPrimaryAudioTrack()`: đọc metadata trên Node; kiểm tra tiếp các API đúng 1.61.6 từ type/source khi triển khai. Không thêm media-parser đã deprecated.
- `renderMedia()`: xuất audio đã đặt trong composition; TTS hoàn thành và được duyệt **trước** khi bắt đầu render. Không gọi model trong React component/calculateMetadata.

## 4. Luồng sử dụng

Thêm mục **Lồng tiếng** trong design, cạnh Storyboard/Render. Cho chuẩn bị bản thu sớm; chỉ duyệt timeline khi toàn bộ cảnh hiện hành đã được duyệt.

### 4.1 Upload

Chọn MP3 hoặc WAV (PCM), tối đa **25 MiB/file**, tối đa **10 phút/file**, không nhận video hoặc nhiều audio track. Upload vào API route riêng, kiểm tra giới hạn trên server theo byte thực tế, không chỉ extension/Content-Length. MIME và container/codec phải khớp allowlist. Metadata nguồn do server đo; không tin duration từ browser. Thiếu track, duration không hữu hạn/≤0, file hỏng hoặc codec không hỗ trợ → failed với lý do rõ ràng.

File hợp lệ là một take mới `pending_review`; có player nghe toàn bản, metadata và nút duyệt/loại. File nguồn không bị cắt/ghi đè khi chỉnh timeline. Không cho nhập URL audio tùy ý trong v1.

### 4.2 Tạo giọng AI

Nhập văn bản (1–**5.000 ký tự**, còn bị giới hạn bởi model nếu thấp hơn), tên người nói/narrator, chọn model/voice từ metadata 9router. Có thể copy lời từ script nhưng không tự sửa ScriptDSL. Ngôn ngữ theo văn bản và khả năng voice; không hardcode tiếng Anh hoặc tiếng Việt, không tự dịch.

Server gọi GET `/models/tts`, `/models/info?id=...` và voicesUrl được kiểm soát cùng router để dựng lựa chọn đúng provider; không suy ra wire model bằng cách nối chuỗi chung cho mọi provider. UI lưu đúng model identifier mà metadata công bố. Endpoint `/audio/speech?response_format=mp3`, body theo contract model đã đối chiếu. Không giả định mọi model có trường `voice`, `speed` hoặc `instructions` giống OpenAI.

Danh sách rỗng hiện tại → UI báo cần cấu hình TTS trong router; upload vẫn dùng được. Bản đầu **chưa đạt đủ nghiệm thu** đến khi có một model/voice hợp lệ và thử được cả hai nguồn. Không tự đổi endpoint, mua provider hoặc dùng fallback khác.

Một lần bấm tạo sinh một take/job duy nhất; double-submit dùng request ID chống tạo trùng. Worker lưu bytes, SHA256, metadata, model identifier và text snapshot. Audio hợp lệ mới `pending_review`; nghe rồi duyệt như upload. Tạo lại luôn là take mới; bản đã duyệt bất biến. Không ghi key, header hoặc raw upstream error vào UI/log.

Đề xuất job `audio.generate`: một outbound synthesis attempt cho một take; timeout hoặc lỗi sau khi đã gửi có thể đã tính phí → failed, user chủ động tạo take khác. Không tự retry POST/fallback provider. Redelivery cùng job không gọi lại nếu take đã hoàn tất hoặc đã có dấu outbound-started chưa có kết quả; báo trạng thái không chắc chắn. Dùng khóa/claim trước outbound để tránh hai worker gửi cùng take; không hứa exactly-once ở provider khi upstream chưa có idempotency.

### 4.3 Timeline chung

Timeline cấp video, **30 fps**, frame bắt đầu tính từ 0. Tối đa **64 clip/video**, tối đa **4 clip phát đồng thời**. Mỗi clip tham chiếu take đã duyệt, có:

`id, takeId, from, trimBefore, durationInFrames, volume, fadeInFrames, fadeOutFrames, allowOverlap, label, speakerRef?`.

- Các frame là số nguyên; from/trim/fade ≥0; duration >0; gain 0..1 (default 1); playbackRate luôn 1; không loop.
- `trimBefore + durationInFrames <= floor(sourceDurationSeconds * 30)`; dùng duration chính xác để hiển thị và giới hạn frame bảo thủ. Không kéo dài silence tự động.
- Khoảng phát `[from, from+durationInFrames)` phải nằm trong tổng frame video. Fade-in + fade-out ≤ duration; default fade đều 0. Fade tuyến tính tại clip local frame, gain numeric cùng công thức cho preview/export. Một-frame clip với fade=0 phát gain đầy đủ.
- Mặc định chặn overlap; người dùng có thể bật cho clip để trộn chủ ý. Khi hai clip giao nhau, cả hai phải bật allowOverlap; giới hạn 4 vẫn áp dụng. Khi có overlap, chia gain tổng của tất cả clip đang hoạt động cho `max(1, tổng gain)` tại frame đó để hạn chế clipping; không hứa loudness chuẩn broadcast hay chống true-peak. Không tự giảm tốc/đổi pitch.
- Split/duplicate clip chỉ tạo mục timeline mới, vẫn dùng take cũ. Nhập số frame hoặc giây (round(seconds*30), rồi validate), nghe thử và kéo scrub trong full-video Player. V1 dùng danh sách clip + ô số; chưa cần editor waveform/drag-drop.
- `speakerRef` chỉ là nhãn liên kết nhân vật. Không tự thay subtitle/dialogue hoặc talk-state theo audio. Nếu cần đồng bộ, user chỉnh scene/dialogue qua luồng sẵn có rồi duyệt lại timeline.
- Narration có thể xuyên nhiều scene; timeline tuyệt đối không tự bám scene khi đổi thứ tự. Thay đổi scene/order/duration/script snapshot làm timeline stale, phải kiểm tra/chỉnh và duyệt lại; không tự dịch chuyển clip.

## 5. Dữ liệu và review (schema mới trong thiết kế đã duyệt)

Giữ nguyên SceneDSL v1 và ScriptDSL v1. Thêm contract độc lập `VoiceoverTimelineV1` (version=1, fps=30, clips theo §4.3, fingerprint).

Đề xuất hai bảng, không dùng `assets/asset_variants`:

1. `audio_takes`: UUID; videoId FK videos restrict; source upload/tts; status review_status; label, speakerRef nullable; text/model metadata nullable cho upload; relative filePath, SHA256, bytes, durationSeconds, sampleRate, channels, codec; requestId unique; synthesisStartedAt nullable; timestamps. Metadata/file nullable trước hoàn tất, bắt buộc đầy đủ khi pending_review/approved. Take bị loại không xuất hiện ở selector mới; không ghi đè file take đã duyệt.
2. `voiceover_timelines`: UUID; videoId FK videos restrict; version integer unique(videoId,version); content JSONB strict `VoiceoverTimelineV1`; status review_status; visualFingerprint, contentHash; timestamps. Mỗi lần lưu tạo version mới; duyệt đúng version bất biến, không sửa approved row. Selection latest version: nếu latest là draft/stale thì không lùi về bản approved cũ để render.

Thêm `audio_take` và `voiceover_timeline` vào target_type để dùng reviews/job_runs hiện có. Thêm `renders.voiceover_timeline_id` nullable FK và `renders.voiceover_snapshot_hash` nullable. Migration kế tiếp chỉ sau kiểm tra journal thực tế (hiện cuối 0003); không sửa migration đã áp dụng. Giữ RLS/quyền truy cập theo convention hiện có, không tự thêm public write policy hoặc mở network cloud.

Audio approval và timeline approval do người dùng thao tác rõ ràng. Draft preview có thể nghe pending takes để duyệt; preview cuối/export chỉ take approved. Thay take, text, gain, trim hoặc placement tạo timeline draft mới, cần duyệt lại. UI có lựa chọn **Video không lồng tiếng**; render request phải chỉ rõ silent hoặc timelineVersionId, không tự bỏ audio khi lỗi.

## 6. Tính nhất quán preview/render

Thêm `VoiceoverTrack` dùng chung, gọi từ `VideoComposition`; full-video Player hiển thị cùng composition, scenes và resolved audio props. Không gắn narration toàn video trực tiếp vào Player từng scene vốn không có global offset.

`VideoProps.voiceover` optional để đường silent cũ còn hợp lệ. New render action phải chốt mode, scenes fingerprint, timeline ID/hash và take hashes khi enqueue, không chốt lại theo latest tại worker start. Worker kiểm tra approved/current tại bắt đầu; stale hoặc hash khác → fail trước bundle. Copy audio vào bundle public cùng PNG, rehash snapshot; render từ bản snapshot đã khóa, không đọc mutable latest trong quá trình render. Lưu manifest cạnh output với scenes/timeline/take hashes, phiên bản package/lock, duration và mode. Video không tiếng có mode silent rõ ràng.

HTTP files bổ sung MP3 `audio/mpeg`, WAV `audio/wav`, giữ Range/HEAD behavior theo route thực tế; không đọc toàn bộ file mỗi lần seek. Audio error ở Player hiện rõ; lỗi render là failed, không succeeded với MP4 câm. Export có audio chọn AAC trong MP4/H264, xác minh bằng metadata và nghe playback khi smoke được user cho phép.

## 7. Phạm vi triển khai và nghiệm thu đề xuất

Thứ tự: (1) contract + DB/review; (2) upload/metadata/storage; (3) router discovery + queued TTS; (4) trang lồng tiếng/timeline/full-video preview; (5) snapshot và production video.render; (6) kiểm chứng local.

Nghiệm thu bản đầu cần cả hai nguồn: một file giọng user cung cấp và một take TTS được user cho phép sinh, cùng timeline, có đoạn cắt và narration qua ranh giới scene; preview và MP4 nghe đúng thời điểm, trim, gain; MP4 có stream audio/duration đúng; stale/invalid/unapproved bị chặn, video silent cũ vẫn chạy. Đây là **kịch bản manual dự kiến**, chưa phải quyền gọi model/render hoặc viết/chạy formal test trong phiên planning.

Không viết/sửa/chạy test theo AGENTS. Lint/tsc/build cho implementation sau duyệt. Smoke dùng dữ liệu thực, số lần gọi model và lời đọc phải được trình bày/duyệt riêng trước khi phát sinh job. Không dùng lại kết quả Boston im lặng để tuyên bố production audio E2E đã đạt.

Ngoài phạm vi: voice cloning, thu mic, tự chia/tạo toàn bộ lời từ script, alignment theo từ, STT, subtitle tự động, lipsync, nhạc/SFX/ducking tự động, waveform, đổi tốc độ, cloud storage/multi-machine rollout. Không nâng Remotion hoặc sửa motion/ba lớp bối cảnh để làm audio.

## 8. Nguồn đối chiếu

Context7: `/remotion-dev/remotion/v4.0.537`, `/decolua/9router`; kiểm tra bổ sung official versioned source và installed types.

- [Audio, tag 4.0.537](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/media/audio.mdx): timing, trim, volume, decode errors, playbackRate.
- [Sequence, tag 4.0.537](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/sequence.mdx): timeline/local frame.
- [Mediabunny metadata, tag 4.0.537](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/mediabunny/metadata.mdx) và [reading media](https://mediabunny.dev/guide/reading-media-files): metadata browser/Node; installed Mediabunny 1.61.6 xác nhận BufferSource.
- [9router TTS tại source pin 0.5.104](https://github.com/decolua/9router/blob/6ed886857da125f4908a8a3c3e64f7f1d8ff8366/skills/9router-tts/SKILL.md): discovery/speech endpoint và khác biệt model identifier. Phiên bản source pin từng đối chiếu router trước đây; phiên khảo sát này xác nhận riêng live models endpoint, không suy ra router chưa nâng phiên bản.

## 9. Handoff sau duyệt thiết kế

Thiết kế đã chốt phạm vi cả upload + TTS, timeline cấp video, review và schema riêng. Implementation plan: `docs/superpowers/plans/2026-10-24-remotion-voiceover.md`; trình duyệt trước khi code. TTS provider/voice cụ thể sẽ chọn qua catalog sau khi router công bố model; đó là cấu hình vận hành, không hardcode vào migration. Builder check r1: “Nothing important left”.
