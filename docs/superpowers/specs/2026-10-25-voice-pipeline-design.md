# Thiết kế: voice pipeline cho nhánh giảng thuật toán (dự án B)

- Ngày: 2026-10-25
- Trạng thái: **Spec đã được user duyệt (2026-10-25). Đã triển khai Task 1–9 của plan `2026-10-25-voice-pipeline.md`; kiểm tay mới đi tới bước sinh voice và sửa một câu (xem mục "Kết quả kiểm tay" cuối plan).**
- Phạm vi: stage `voice`, sinh và lưu audio, UI nghe thử/duyệt, timing theo audio, ghép audio khi render. **Có đổi schema và hợp đồng dữ liệu** nên phải được duyệt trước khi triển khai (AGENTS.md luật 3).
- Liên quan: `2026-10-23-algorithm-video-design.md` (§1 mục 13–16, §8.2, §14), `2026-10-24-docker-tts-service.md`, `2026-10-24-ui-workspace-design.md`. Dự án C (engine animation, Player đồng bộ) có spec riêng, làm sau B.

## 1. Mục tiêu

Hiện video giảng thuật toán không có âm thanh: animation do LLM tự đặt `durationFrames`, render chỉ ra hình. Mục tiêu của B:

1. Sinh voiceover tiếng Việt bằng service TTS local (VieNeu-TTS v3 Turbo, giọng miền Nam, không clone, không watermark) từ lời thoại kịch bản đã duyệt.
2. Người dùng nghe thử, sửa text đọc, chỉnh tốc độ (mặc định 1,25×, trong 1,0–1,5×) và **duyệt giọng trước khi tạo animation**.
3. Timing cảnh bám thời lượng audio thật; phụ đề được kiểm theo thời lượng đó.
4. Render MP4 có audio, tái lập được từ các revision đã duyệt.

## 2. Hiện trạng đã đối chiếu (2026-10-25)

| Thành phần | Thực tế |
|---|---|
| Kịch bản | `AlgorithmScriptV1`: mỗi cảnh có `dialogue: string[]`, `subtitles: string[]` (độ dài mỗi mảng độc lập, ≤ 30), `seconds` ước lượng (`src/lib/algorithm/contracts.ts`) |
| Animation | `AlgorithmAnimationV1`: `durationFrames` từng cảnh do LLM đặt, 30 fps, 1080×1920; không có audio |
| Stage | enum `algorithm_stage`: problem, solution, combo, script, assets, animation, render, done. Workflow đi problem → solution → combo → script → animation → render (bước `assets` không dùng); `STEPS` ở `src/lib/algorithm/steps.ts` |
| Service TTS | `services/tts/server.py`: `POST /synthesize {text, voice, speed}` trả WAV 48 kHz; speed áp bằng `ffmpeg atempo` (clamp 0,5–2,0); `GET /voices`, `GET /health`. Client ở `src/lib/tts/client.ts` (timeout 60 giây) |
| Render | `algorithm.video.render` dùng bundle Remotion với `publicDir` tạm; output ở `algorithm_outputs` (có `assetManifest`, `inputFingerprint`) |
| Spike TTS | RTF ≈ 0,25–0,28 trên CPU; `infer()` không có tham số tốc độ; chưa nghe đánh giá chất lượng ở 1,25×/1,5× (spike 2026-10-24) |

Chưa tra cứu lại API Remotion `<Audio>`/`Sequence` và `@remotion/media-utils` cho phiên bản 4.0.537; plan phải đối chiếu tài liệu chính thức và context7 trước khi code.

## 3. Phạm vi

### Trong phạm vi

- Stage `voice` trong workflow (revision, duyệt, stale như các stage khác).
- Contract `AlgorithmVoiceV1`, bảng `algorithm_voice_clips`, job `algorithm.voice.generate`.
- LLM viết `spokenText`; kiểm máy tất định; sinh clip tuần tự qua service TTS; tái dùng clip theo fingerprint.
- UI bước Voice (chọn giọng, tốc độ, ghi đè theo cảnh, nghe thử, sửa text, duyệt).
- Timeline voice làm đầu vào cố định cho animation; kiểm phụ đề theo thời lượng thật.
- Ghép audio vào render.

### Ngoài phạm vi

- Nhạc nền, hiệu ứng âm thanh, clone giọng, watermark, đồng bộ khẩu hình.
- Đổi DSL animation, Player đồng bộ, timeline action (dự án C).
- Chỉnh tốc độ từng câu thoại; chọn giọng riêng từng cảnh.
- Viết hoặc chạy test (AGENTS.md luật 4–6).

## 4. Quyết định đã chốt

| # | Quyết định |
|---|---|
| 1 | Voice là **stage riêng** giữa `script` và `animation`; duyệt giọng trước khi sinh animation |
| 2 | Revision `voice` là stage revision bình thường; file audio nằm ở bảng clip riêng |
| 3 | Tốc độ: mặc định theo video (1,25×), ghi đè theo cảnh, mọi giá trị trong 1,0–1,5× |
| 4 | `spokenText` do LLM viết, người dùng sửa được; câu thoại và phụ đề đã duyệt trong kịch bản **không bị đổi** |
| 5 | Sửa text hoặc tốc độ tạo revision mới; chỉ clip có fingerprint mới được sinh lại |
| 6 | Một giọng cho cả video; chọn trong các giọng miền Nam của service |

## 5. Kiến trúc

### 5.1 Luồng

```text
Kịch bản (đã duyệt)
  → job algorithm.voice.generate
      LLM viết spokenText từng câu thoại → kiểm máy → sinh clip từng cue (tuần tự)
      → revision voice = pending_review, job kết thúc
  → người dùng nghe, sửa text/tốc độ (revision mới, chỉ clip đổi được sinh lại) → duyệt
  → Animation: nhận timeline voice làm đầu vào cố định
  → Render: ghép clip đã duyệt
```

Đổi kịch bản làm `voice`, `animation`, `render` thành stale (quy tắc §11 của spec algorithm). Đổi voice làm `animation` và `render` thành stale.

### 5.2 Hợp đồng `AlgorithmVoiceV1`

```ts
{
  version: 1,
  voice: string,                       // id giọng, thuộc danh sách /voices của service
  defaultSpeed: number,                // 1.0–1.5, mặc định 1.25
  scenes: [{ sceneId: string, speed?: number }],   // ghi đè theo cảnh, 1.0–1.5
  cues: [{
    id: string,                        // ổn định: `${sceneId}:${dialogueIndex}`
    sceneId: string,
    dialogueIndex: number,             // chỉ số trong script.scenes[].dialogue
    spokenText: string,                // văn nói, 1..N ký tự (N chốt trong plan)
  }]
}
```

Ràng buộc kiểm ở lớp parse và lớp máy:

- Mỗi `(sceneId, dialogueIndex)` của kịch bản đã duyệt có đúng một cue; không cue thừa; `sceneId` tồn tại.
- Tốc độ hữu hạn và trong khoảng cho phép; `voice` nằm trong danh sách service trả về lúc sinh.
- `spokenText` không chứa chữ số, ký hiệu toán/code hoặc ký tự mà bộ kiểm không đọc được thành chữ (danh sách ký tự cụ thể chốt trong plan bằng nghe thử). Bộ kiểm là hàm thuần, không gọi LLM.
- Quan hệ giữa `dialogue` và `subtitles` hiện **không bị ràng buộc cùng độ dài** trong `AlgorithmScriptV1`. Plan phải xác định cách gắn phụ đề vào cue (theo chỉ số khi hai mảng bằng nhau; nếu khác nhau thì báo lỗi kiểm máy thay vì đoán) và không đổi hợp đồng kịch bản nếu không cần.

### 5.3 Dữ liệu (đề xuất, chờ duyệt)

1. Thêm giá trị `voice` vào enum `algorithm_stage`. Postgres cấm dùng giá trị enum vừa thêm trong cùng transaction migration, nên tách thành hai migration: (a) `ALTER TYPE ... ADD VALUE IF NOT EXISTS 'voice'`; (b) cột và ràng buộc dùng giá trị đó.
2. `algorithm_workflows`: thêm `active_voice_id`, `accepted_voice_id`, theo mẫu các con trỏ hiện có. Cập nhật trigger/ràng buộc con trỏ stage nếu có (migration 0005, 0006, 0009 là nguồn; plan phải đọc lại SQL trước khi sửa).
3. Bảng mới `algorithm_voice_clips`:

| Cột | Ý nghĩa |
|---|---|
| `id` | khóa chính |
| `video_id`, `voice_revision_id` | liên kết revision voice (cùng kiểu FK tổng hợp như `algorithm_outputs`) |
| `cue_id` | id cue trong revision |
| `fingerprint` | sha256 hex của `spokenText + voice + speed + phiên bản engine`; check `^[a-f0-9]{64}$` |
| `status` | `generating`, `ready`, `failed` |
| `file_path` | đường dẫn tương đối trong `DATA_DIR`, nhất quán với `src/lib/storage`; unique |
| `duration_ms` | thời lượng thật sau `atempo`; bắt buộc khi `ready` |
| `error` | lỗi đã lọc, giới hạn độ dài |

   Unique `(voice_revision_id, cue_id)`. Clip cùng `fingerprint` có thể dùng lại giữa các revision của cùng video bằng cách trỏ cùng file (hàng clip mới trỏ `file_path` đã có, hoặc bảng cho phép nhiều hàng chung file; chọn một cách trong plan và nêu quy tắc xóa file).
4. Thêm loại job `algorithm.voice.generate` vào `JOB_TYPES`/`handlers`; thêm giá trị target type nếu `job_runs` cần.
5. Không đổi `SceneDsl`, bảng hoạt hình, hợp đồng 9router.

Mọi thay đổi trên là đề xuất; plan phải cụ thể hóa SQL và được duyệt riêng trước khi `drizzle-kit generate`, không tự áp migration.

### 5.4 Job `algorithm.voice.generate`

- Tạo revision `generating` và `algorithm_generation_runs` trước khi enqueue, trong cùng transaction (khuôn của các job algorithm hiện có).
- Bước 1: nếu revision chưa có `spokenText` (lần đầu), gọi LLM sinh `spokenText` cho từng câu thoại; dữ liệu đầu vào (lời thoại, code) là input không tin cậy trong prompt. Khi người dùng sửa tay, revision mới mang sẵn `spokenText`, bỏ qua bước này.
- Bước 2: kiểm máy; lỗi kiểm thì ghi issues vào revision và dừng ở `pending_review` kèm cảnh báo (không lặp vô hạn; tối đa số lượt sửa máy chốt trong plan, tương tự solution graph).
- Bước 3: với từng cue, tính fingerprint; clip `ready` cùng fingerprint thì dùng lại; còn lại gọi `synthesizeTTS` tuần tự (service TTS xử lý từng yêu cầu), ghi file bằng storage (ghi tạm rồi đổi tên), lưu `duration_ms`.
- Job dài gia hạn khóa bằng `ctx.extendLock`. Kết thúc khi revision `pending_review`; chờ nghe không giữ khóa hàng đợi.
- Lỗi service TTS (không kết nối, 5xx, timeout) là lỗi hạ tầng: thử lại theo cơ chế runner, không ghi thành nội dung bị từ chối. Lỗi đầu vào (text rỗng/quá dài) là `PermanentJobError`.
- Hai job cho cùng workflow không được cùng chiếm con trỏ active; kiểm fingerprint đầu vào (kịch bản đã duyệt) ngay trước khi publish, như `generateAlgorithmSolution`.

### 5.5 Timing và animation

- `cueFrames = ceil(duration_ms × 30 / 1000) + gapFrames`; `gapFrames` là hằng số cấu hình chung (giá trị chốt bằng nghe thử trong plan; không tự đặt trong spec).
- Thời lượng cảnh = tổng `cueFrames` của cảnh. Timeline voice (cảnh → khoảng frame, cue → frame bắt đầu) là hàm thuần từ revision voice đã duyệt và các clip `ready`.
- Job animation nhận timeline voice như đầu vào cố định (cùng revision voice đã duyệt vào danh sách input/fingerprint). Checker animation từ chối bản có `from`/`durationFrames` khác timeline voice, hoặc tổng vượt 5400 frame.
- Kiểm phụ đề theo thời lượng thật: mỗi cue phụ đề phải đạt profile §14 (17 ký tự/giây, 42 ký tự × 2 dòng, 5/6–7 giây) trên khoảng thời gian cue thực tế; vi phạm thì báo issue, không tự rút gọn nội dung.
- Nếu tổng thời lượng audio vượt giới hạn 3 phút, báo vấn đề cho người dùng; không tự tăng tốc quá 1,5× hay cắt lời.

### 5.6 Render

- `algorithm.video.render` kiểm lại: revision voice được duyệt, mọi clip `ready` và tồn tại trên đĩa, fingerprint khớp, ngay trước khi render.
- Chép clip vào `publicDir` tạm (giống cách xử lý ảnh asset ở chế độ static) và composition đặt `<Audio>` trong `<Sequence>` theo frame bắt đầu của cue. API chính xác (`Audio`, `Sequence`, `staticFile`, codec audio của `renderMedia`) phải đối chiếu tài liệu Remotion 4.0.537 trong plan; spike 2026-10-23 chưa kiểm audio.
- `assetManifest` của output ghi thêm hash từng clip; `inputFingerprint` gồm revision voice.
- Mã trong bundle Remotion không import DB, `pg`, `sharp`, `fs` (CLAUDE.md); đường dẫn clip do worker truyền qua props, không do model cung cấp.

### 5.7 Giao diện (bước Voice trong workspace)

- `STEPS` thêm `{ key: "voice", label: "Voice", requires: "script" }`; `animation` đổi `requires: "voice"`; thêm con trỏ vào `POINTERS`/`deriveStepStates`.
- Bố cục: chọn giọng (danh sách từ `/voices`, lọc miền Nam) và tốc độ mặc định; mỗi cảnh một ô tốc độ ghi đè; mỗi cue một hàng gồm câu thoại gốc (chỉ đọc), `spokenText` (sửa được), nút phát, thời lượng, trạng thái clip.
- Phát audio qua `GET /api/files/<path>` (đã hỗ trợ `Range`).
- Nút "Sinh lại" dùng `ActionButton` và `useActionFeedback`; trạng thái job qua `ActivityProvider` và `JobStatusBar` hiện có.
- Duyệt/từ chối dùng cơ chế decision hiện có (`algorithm_decisions`, lý do bắt buộc khi từ chối, `concurrencyVersion`).

## 6. Xử lý lỗi và biên

- Service TTS tắt: nút sinh hiển thị lỗi hạ tầng rõ ràng; job thử lại theo runner, không đánh dấu nội dung sai.
- Một cue lỗi, các cue khác ổn: clip đó `failed`, revision vẫn `pending_review` với cảnh báo; không được duyệt khi còn clip `failed` hoặc thiếu.
- File clip bị xóa ngoài ý muốn: render từ chối và yêu cầu sinh lại voice; không render im lặng.
- Hai tab cùng sửa: `concurrencyVersion` chặn ghi chồng.
- Voice chưa duyệt mà gọi sinh animation: chặn ở server action và worker, không chỉ UI.
- Mọi lỗi lưu đã lọc secret và giới hạn độ dài.

## 7. Kiểm chứng

Theo AGENTS.md luật 4–6: **không viết, không chạy test**. Dùng `npm run lint`, `npx tsc --noEmit`, `npm run build`. Sau đó kiểm tay có chủ đích:

- Nghe thử mẫu ở 1,0×, 1,25×, 1,5× và chọn `gapFrames`, giọng mặc định, độ dài cue tối đa (có người nghe duyệt).
- Đi qua luồng: duyệt kịch bản → sinh voice → sửa một câu và xác nhận chỉ clip đó sinh lại → duyệt → animation → render.
- Phát MP4 ở nhiều mốc đầu/cuối cue để kiểm đồng bộ audio–phụ đề.
- Tắt service TTS và quan sát hành vi lỗi.

Báo cáo ghi rõ điều đã thấy thực tế và điều chưa.

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Chất lượng giọng ở 1,25×–1,5× chưa nghe đánh giá | Nghe thử trước khi chốt mặc định; ngưỡng 1,5× giữ làm trần |
| Service TTS tuần tự, bài dài tốn thời gian (RTF ≈ 0,27) | Tái dùng clip theo fingerprint; gia hạn khóa; sinh tuần tự trong một job |
| Enum/migration: dùng giá trị mới trong cùng transaction | Tách hai migration |
| Trigger/ràng buộc con trỏ stage (0005, 0006, 0009) không biết `voice` | Đọc lại SQL, thêm migration sửa trigger trong plan; xin duyệt |
| Không ràng buộc `dialogue`/`subtitles` cùng độ dài | Kiểm máy báo lỗi, không đoán |
| Audio trong bundle Remotion chưa spike | Spike nhỏ ở đầu plan trên 4.0.537 |
| Worker tuần tự bị render/voice chặn nhau | Chấp nhận trong MVP, ghi rõ; không thêm hàng đợi song song |
| Dung lượng đĩa cho nhiều revision clip | Chia sẻ file theo fingerprint; chính sách dọn file chốt trong plan |

## 9. Còn cần chốt trong plan

- Giá trị `gapFrames`, giọng mặc định, độ dài `spokenText` tối đa, danh sách ký tự cấm, định dạng lưu (WAV 48 kHz hiện tại hay chuyển sang định dạng nhỏ hơn).
- Cách chia sẻ file clip giữa các revision và quy tắc xóa.
- Tên đúng của target type và `job_runs` liên quan.
- SQL migration cụ thể (hai bước) và thay đổi trigger.
- Thứ tự commit nhỏ đúng scope: contract và bộ kiểm; migration; job voice; UI bước Voice; timeline và checker animation; render audio; tài liệu.
