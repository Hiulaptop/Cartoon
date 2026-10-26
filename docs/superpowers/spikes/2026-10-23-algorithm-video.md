# Spike: algorithm video (2026-10-23)

## Phạm vi và môi trường

- Làm theo Lát 0 của `docs/superpowers/plans/2026-10-23-algorithm-video.md`.
- Không sửa app/worker production, schema hoặc migration.
- Không gọi 9router/LLM. Repo dùng 9router OpenAI-compatible client; `claude-api` skill không áp dụng và không thêm Anthropic SDK.
- Runtime versions lấy từ `package-lock.json` và `npm ls`-equivalent package manifests: Node 24.15.0; `@langchain/langgraph` 1.5.1; `@langchain/langgraph-checkpoint-postgres` 1.1.0; `remotion`, `@remotion/bundler`, `@remotion/player`, `@remotion/renderer` 4.0.537; React 19.1.0.
- Prototype files: `scripts/spikes/algorithm-video/langgraph-interrupt.mjs`, `remotion-entry.tsx`, `render-remotion.mjs`; output `data/spikes/algorithm-video/algorithm-probe.mp4` (đường dẫn data được gitignore).

## LangGraph interrupt/resume

**Docs chính thức:** https://docs.langchain.com/oss/javascript/langgraph/interrupts

Docs hiện hành xác nhận: graph cần checkpointer và `configurable.thread_id`; gọi `interrupt(payload)` trong node; resume bằng `graph.invoke(new Command({ resume: response }), sameConfig)`; node chứa interrupt chạy lại từ đầu nên thao tác trước điểm interrupt cần idempotent; nhiều interrupt dùng map theo interrupt ID.

**Prototype thực chạy:** `node scripts/spikes/algorithm-video/langgraph-interrupt.mjs`.

- Dùng `MemorySaver`, tạo state candidate, gọi `interrupt()` trong node `review`.
- Invoke đầu trả `__interrupt__` chứa candidate.
- Resume với cùng `thread_id` và `Command({ resume: { approved, revisionId } })`.
- Kết quả `decision` chính xác bằng resume payload.
- Output đã quan sát:

```json
{"paused":{"candidate":{"id":"candidate-v1","answer":"draft"}},"resumed":{"approved":true,"revisionId":"revision-v1"}}
```

**Giới hạn:** đây chỉ xác minh API/control flow cùng in-memory saver. Chưa chứng minh PostgresSaver restart, transaction quyết định DB + enqueue, outbox/reconciler, duplicate resume hoặc crash consistency. Repo hiện tạo PostgresSaver trong `src/worker/scene-jobs.ts` bằng `setup()` trên pool cấu hình thật; `.env` không cho biết một DB spike riêng. Không chạy setup lên DB có thể là production, do đó Postgres persistence phải được xác minh tiếp sau khi được chỉ rõ môi trường DB thử nghiệm an toàn.

## Remotion vertical rendering

**Tài liệu chính thức:**

- Player: https://www.remotion.dev/docs/player
- Player API: https://www.remotion.dev/docs/player/player
- `renderMedia`: https://www.remotion.dev/docs/renderer/render-media

Docs xác nhận Player nhúng video Remotion trong React và nhận `inputProps`; `renderMedia` nhận composition/serveUrl/codec, và cùng `inputProps` cần được truyền cho `selectComposition` và `renderMedia`. Player overview không khẳng định parity tự động giữa Player và worker; phải dùng component/props chung và xác minh qua spike UI sau này.

**Prototype thực chạy:** `node scripts/spikes/algorithm-video/render-remotion.mjs`.

- Dùng composition riêng, không import app code/DB.
- Nội dung có chữ tiếng Việt, array cells thay đổi highlight theo frame, SVG graph đơn giản.
- Render ra `data/spikes/algorithm-video/algorithm-probe.mp4`.
- Kiểm tra container có `ftyp`, `moov`, `mdat`; `ffprobe` báo:
  - codec: H.264
  - resolution: 1080×1920
  - frame rate: 30/1
  - duration: 3.000 s
- Worker bundle/render đã chạy thành công trên dependency Remotion 4.0.537.

**Giới hạn:** prototype không dùng `@remotion/player` trong browser và chưa so sánh frame-by-frame giữa Player/renderer. Chưa kiểm tra layout chữ thực tế bằng mắt trên điện thoại, maximum code lines, safe area, font fallback, asset image crop, audio hoặc 3 phút render.

## Kết luận/ảnh hưởng

1. Có thể giữ lựa chọn kiến trúc đã duyệt: DSL khai báo JSON + renderer Remotion cố định là hướng khả thi; spike không yêu cầu eval TSX tự do.
2. Composition dọc 1080×1920/30fps, SVG graph + array + Unicode tiếng Việt render được ở worker trên bộ Remotion đã ghim.
3. Không đủ bằng chứng để khẳng định Player/worker parity cho đến khi có UI preview sử dụng composition/properties chung; việc này thuộc lát animation.
4. LangGraph API hỗ trợ interrupt/resume theo contract đã mô tả, nhưng persistence Postgres/reconciliation vẫn là yêu cầu triển khai chưa được spike.
5. Không đổi spec/schema trong lát 0. Không có test file nào được tạo hoặc chạy. Không apply migration, không gọi LLM.

## Nguồn

- LangGraph JS interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- Remotion Player: https://www.remotion.dev/docs/player
- Remotion Player API: https://www.remotion.dev/docs/player/player
- Remotion renderMedia: https://www.remotion.dev/docs/renderer/render-media

## Spike TTS local: VieNeu-TTS v3 Turbo (2026-10-24)

Chạy ngoài repo tại `D:\tmp\vieneu-spike` (venv riêng, `vieneu==3.8.3`, Apache-2.0, không kéo PyTorch; ONNX Runtime 1.31.0). Không sửa `package.json`, Dockerfile hay DB.

- **Máy:** i5-13600K, RAM 31,7 GB, GPU AMD RX 7700 XT (không CUDA) nên chạy CPU.
- **Tải model + khởi tạo:** 45,7 s lần đầu (tải), 7,8 s các lần sau.
- **Giọng:** `list_preset_voices()` trả 25 giọng; có nhãn giới tính, miền (Bắc/Trung/Nam) và phong cách (tự nhiên, tin tức, kể chuyện). Đã thử Adam bựa, Trúc Ly, Thiện Minh.
- **Tốc độ sinh trên CPU:** RTF 0,25–0,28 (1,0–1,5 s cho câu 3,4–5,9 s audio), tốt hơn mức RTF < 1 mà tài liệu nêu.
- **Sample rate:** 48 kHz (ffprobe khớp thời lượng đã tính).
- **Tốc độ nói:** `infer()` của Turbo **không có tham số `speed`** (chữ ký: text, ref_audio, voice, style, denoise, temperature, top_k, top_p, max_new_frames, repetition_penalty, repetition_window, max_chars, silence_p, crossfade_p, apply_watermark, batch_size). Dùng `ffmpeg atempo` sau khi sinh: 1,25× cho câu 4,55 s ra 3,66 s; 1,5× ra 3,04 s. Chất lượng giọng ở 1,25×/1,5× phải nghe bằng tai, chưa đánh giá.
- **Watermark:** `apply_watermark=True` mặc định nhưng chỉ có tác dụng khi cài extra `vieneu[watermark]` (`resemble-perth`); chưa cài nên audio spike không có watermark. Cần quyết định có bật khi tích hợp.
- **Chưa kiểm:** độ tự nhiên/phát âm tiếng Việt (cần người nghe), từ viết tắt và ký hiệu toán/code (`O(log n)` đọc ra sao), `max_chars=256` với câu dài, chạy trong Docker, đồng thời với render Remotion.

## Spike audio voice (2026-10-25)

Script throwaway: `scripts/spikes/algorithm-video/voice-audio-spike.mjs` + `voice-entry.tsx`. Service TTS chạy sẵn trên `127.0.0.1:8080`; mẫu và video thử ở `data/spikes/voice/` (bị `.gitignore`).

- **Nguồn tài liệu:** context7 `/remotion-dev/remotion` v4.0.537 và https://www.remotion.dev/docs/html5-audio . Trong 4.0.537, `<Html5Audio>` import từ `remotion` (tên `Audio` cũ đã đổi); props `src` (dùng `staticFile`), `volume`, `trimBefore`, `durationInFrames`. `<Audio>` từ `@remotion/media` là lựa chọn cho dự án mới nhưng cần thêm gói nên không dùng.
- **Audio trong `renderMedia` h264:** có. Hai `Sequence` với offset khác nhau, mỗi `Sequence` chứa một `Html5Audio` + `staticFile` từ `publicDir`: ffprobe thấy stream video h264 và stream audio aac. `silencedetect` cho thấy clip thứ hai bắt đầu ở 3,95 giây, khớp frame 116 (15 + 95 + 6) cộng phần lặng đầu clip; offset đúng.
- **Dung lượng WAV 48 kHz:** khoảng 96 KB/giây, tức khoảng 5,8 MB/phút audio. Chấp nhận, giữ WAV.
- **Thời lượng:** câu 1 ở giọng Thùy Dung 3,76 giây (1,0×), 3,14 giây (1,25×), 2,66 giây (1,5×).
- **Câu dài:** 300 ký tự sinh được (13,5 giây audio) nhưng mất 18,7 giây, chậm hơn mức RTF 0,27 của spike cũ (RTF khoảng 1,4 với câu dài trong lần đo này). Ước lượng sinh bài 3 phút cần tính theo mức này, không theo 0,27. Một cue 300 ký tự dài khoảng 13 giây, vượt trần phụ đề 7 giây của profile §14: giới hạn mềm này được cảnh báo ở bước duyệt, không chặn.
- **Chọn bởi user (nghe thử 2026-10-25):** giọng mặc định `Adam`; tốc độ mặc định 1,25×, trần 1,5×; khoảng nghỉ 6 frame (0,2 giây); độ dài `spokenText` tối đa 300 ký tự; lưu WAV.
- **Giới hạn:** chất lượng giọng chỉ nghe qua vài câu mẫu (Thùy Dung 1,0/1,25/1,5×, Adam 1,25×); chưa nghe trọn một bài; chưa đo song song nhiều request.
