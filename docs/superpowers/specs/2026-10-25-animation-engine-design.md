# Thiết kế: engine animation cho nhánh giảng thuật toán (dự án C)

- Ngày: 2026-10-25
- Trạng thái: **Thiết kế được user duyệt trong chat ngày 2026-10-25; user ra lệnh thực thi trực tiếp nên triển khai không qua plan riêng. Đã triển khai và kiểm tay (xem mục 14).**
- Phạm vi: hợp đồng `AlgorithmAnimationV2`, engine diễn hoạt Remotion, bộ kiểm tra, prompt/job sinh animation, preview trong app. **Có đổi hợp đồng dữ liệu** nên phải được duyệt trước khi triển khai (AGENTS.md luật 3). Không đổi schema DB.
- Liên quan: `2026-10-23-algorithm-video-design.md` (§8, §12–13), `2026-10-25-voice-pipeline-design.md` (timeline theo audio), `2026-10-25-model-selection-design.md`.

## 1. Vấn đề và mục tiêu

Video render ngày 2026-10-25 cho thấy animation "chưa có gì hấp dẫn": mỗi cảnh LLM chỉ trả `title`, `values`, `code`, `highlightIndex` tĩnh, nên composition vẽ chữ, vài ô số và khối code đứng yên suốt cảnh. Không có khái niệm "bước", không có chuyển động gắn với lời giảng.

Mục tiêu: mỗi cảnh diễn giải thuật toán bằng **chuyển động có mục đích** (đưa dữ liệu vào, đánh dấu trạng thái, trượt con trỏ, đổi chỗ, cập nhật giá trị), bắt đầu đúng lúc câu thoại tương ứng được đọc, theo art direction đã duyệt (nền kem sáng, màu theo ý nghĩa). Phiên bản đầu (v1 của engine) tập trung vào mảng ô, con trỏ và đánh dấu.

## 2. Quyết định đã chốt (user duyệt 2026-10-25)

| # | Quyết định |
|---|---|
| 1 | LLM chỉ mô tả **các bước mang ý nghĩa thuật toán**; engine cố định tự tính tọa độ, thời gian, chuyển động. LLM không viết toạ độ, easing hay thời lượng |
| 2 | Primitive của v1: **mảng ô + con trỏ + đánh dấu**. Khối code giữ như hiện tại (tĩnh). Lưới 2 chiều, đồ thị, stack/queue, bôi dòng code và bảng biến để sau |
| 3 | Mỗi bước gắn vào **một cue thoại**; nhiều bước cùng cue chia đều thời gian của cue (có trọng số tùy chọn). Không neo theo từng từ |
| 4 | Nâng hợp đồng lên `AlgorithmAnimationV2` trong **cùng stage Animation** (không thêm stage, không thêm migration). Revision V1 cũ vẫn xem và render được |

## 3. Hiện trạng đã đối chiếu (2026-10-25)

| Thành phần | Thực tế |
|---|---|
| Hợp đồng | `AlgorithmAnimationV1Schema` (`src/lib/algorithm/contracts.ts`): 1080×1920, 30 fps, tối đa 5400 frame; mỗi cảnh có `id`, `from`, `durationFrames`, `title`, `narration[]`, `subtitles[]`, `code`, `values[]`, `highlightIndex` |
| Timeline | `from`/`durationFrames` từng cảnh do voice quyết định (`buildVoiceTimeline`); `checkAnimationAgainstTimeline` từ chối lệch |
| Composition | `src/remotion/algorithm/video.tsx`: `Scene` vẽ tiêu đề, dãy ô tĩnh, khối `<pre>` code, phụ đề; `PALETTE` (paper, ink, progress, focus, valid, reject, line, surface); phụ đề theo cue qua prop `captions`; audio qua `Html5Audio` và prop `audio` |
| Job | `generateStage("animation")` trong `src/worker/algorithm-stage-jobs.ts`: gọi LLM một lần, `validateStagePayload` rồi kiểm timeline; không có vòng sửa máy |
| Preview | `src/components/algorithm/animation-preview.tsx` (Remotion Player) chưa có audio, chưa có phụ đề theo cue |
| Voice | Có timeline cue (`VoiceTimeline.scenes[].cues[]`: `cueId`, `from`, `frames`, `audioFrames`) và văn nói từng cue |

Chưa tra cứu lại tài liệu Remotion cho các API dùng trong engine (`useCurrentFrame`, `interpolate`, `spring`, `Easing`, `measureText` nếu cần). Plan phải đối chiếu tài liệu chính thức và context7 cho Remotion 4.0.537 trước khi code.

## 4. Phạm vi

### Trong phạm vi
- Hợp đồng `AlgorithmAnimationV2`, bộ op allowlist, hàm `simulateScene` thuần.
- Engine hiển thị mảng ô, con trỏ, đánh dấu, đổi chỗ, đổi giá trị, ghi chú ngắn.
- Bộ kiểm tra tất định cho V2; prompt và vòng sửa máy cho job sinh animation.
- Dispatch composition theo `version`; preview trong app có audio và phụ đề theo cue.

### Ngoài phạm vi
- Bôi dòng code và bảng biến, lưới/bảng 2 chiều, đồ thị, stack/queue.
- Đồng bộ theo từng từ (cần timestamp từ TTS), hiệu ứng âm thanh, nhạc nền, chuyển cảnh, chuyển động camera.
- Chạy code lời giải, TSX/JS do LLM sinh (vẫn cấm, spec algorithm §8.1).
- Đổi schema DB, đổi voice pipeline, viết hoặc chạy test (AGENTS.md luật 4–6).

## 5. Hợp đồng `AlgorithmAnimationV2`

```ts
{
  version: 2, width: 1080, height: 1920, fps: 30, durationFrames: number,   // như V1
  scenes: [{
    id: string,                // khớp id cảnh kịch bản, cùng thứ tự
    from: number, durationFrames: number,   // đúng timeline voice
    title: string,
    code: string,              // hiển thị tĩnh như V1
    array?: { values: string[]; labels?: string[] },    // 1..12 ô; mỗi giá trị tối đa 8 ký tự
    steps: [{
      cueId: string,           // cue thuộc đúng cảnh này
      weight?: number,         // số nguyên 1..5, mặc định 1
      ops: Op[],               // 1..8 op
    }],                        // tối đa 40 bước mỗi cảnh
  }]
}
```

Không còn `narration`, `subtitles`, `values`, `highlightIndex` trong V2: phụ đề lấy từ kịch bản đã duyệt theo cue (như bước render hiện nay), nên LLM **không thể** đổi lời thoại hay phụ đề.

### 5.1 Bộ op (allowlist, tham số hữu hạn)

| Op | Tham số | Ý nghĩa |
|---|---|---|
| `pointer.show` | `name` (1–4 ký tự), `index`, `side?` (`above`/`below`) | Hiện con trỏ có nhãn dưới/trên một ô |
| `pointer.move` | `name`, `index` | Trượt con trỏ đã hiện sang ô khác |
| `pointer.hide` | `name` | Ẩn con trỏ |
| `cell.mark` | `indices[]`, `state` | Đánh dấu ô: `considering` (đang xét), `valid`, `rejected`, `found` |
| `cell.set` | `index`, `value` | Đổi giá trị ô |
| `cell.swap` | `i`, `j` | Đổi chỗ hai ô (chuyển động cung) |
| `range.highlight` | `from`, `to`, `state` | Tô một đoạn liên tiếp |
| `note` | `text` (tối đa 60 ký tự) | Chú thích ngắn dưới mảng |
| `clear` | `target` (`marks`/`pointers`/`note`/`all`) | Xóa dấu, con trỏ hoặc chú thích |

Mọi op tác động **tích lũy** lên trạng thái cảnh; không op nào chạy code hay nhận URL/đường dẫn. Tối đa 4 con trỏ cùng lúc.

## 6. Engine diễn hoạt

### 6.1 Mô hình thời gian
- Cửa sổ của cue lấy từ timeline voice: `[cue.from, cue.from + cue.frames)` (frame tuyệt đối).
- Các bước cùng cue chia cửa sổ theo `weight`; mỗi bước có **thời gian chuyển** `T = min(18 frame, 60% độ dài lát)`, các op trong bước chạy đồng thời trong `T` rồi giữ trạng thái đến hết lát để người xem đọc.
- Bước theo thứ tự trong cảnh, cue không giảm dần. Cue không có bước giữ nguyên trạng thái trước đó. Đầu cảnh: mảng hiện ở trạng thái ban đầu, không dấu, không con trỏ.
- Hằng số (T, easing, độ nảy) chốt trong plan bằng xem video thật; không tự đặt con số cuối trong spec.

### 6.2 `simulateScene` (hàm thuần, chạy được trong trình duyệt)
- Đầu vào: cảnh V2 và cửa sổ cue; đầu ra: danh sách snapshot theo bước (giá trị từng ô, dấu, vị trí con trỏ, ghi chú, hoán vị) và hàm nội suy trạng thái tại một frame (vị trí con trỏ là số thực để trượt mượt, màu mờ dần, ô đổi chỗ đi theo cung).
- Dùng chung bởi bộ kiểm tra (app + worker) và composition (bundle Remotion): **không import DB, `pg`, `sharp`, `fs`** (CLAUDE.md).

### 6.3 Bố cục (khổ dọc 1080×1920)
- Giữ vùng an toàn hiện có: lề 72 px, phụ đề cách đáy 180 px.
- Mảng một hàng, chiều rộng khả dụng 936 px; ô rộng `min(120, (936 − 8·(n−1)) / n)` (tối thiểu khoảng 64 px khi n = 12); con trỏ nằm trên hoặc dưới ô, nhãn không đè nhau khi hai con trỏ cùng một ô (xếp lệch).
- Thứ tự dọc: tiêu đề, mảng + con trỏ, ghi chú, khối code, phụ đề. Chỉnh khoảng cách, cỡ chữ cuối cùng bằng xem khung hình thật (plan).
- Màu theo ý nghĩa, dùng `PALETTE` hiện có: `considering` vàng, `valid` xanh, `rejected` đỏ (kèm làm mờ để không chỉ dựa vào màu), `found` cam nhấn; chữ luôn đủ tương phản (kiểm trong plan).

## 7. Kiểm tra tất định (`checkAnimationV2`)

Hàm thuần dùng ở job, `approveAlgorithmStage` và `prepareRender`. Trả danh sách lỗi (chặn) và cảnh báo (không chặn).

**Lỗi (chặn):**
- Sai schema; cảnh không khớp id/thứ tự/`from`/`durationFrames` với timeline voice (tái dùng `checkAnimationAgainstTimeline`).
- Bước có `cueId` không thuộc cảnh, hoặc thứ tự cue giảm dần.
- Chỉ số ngoài biên mảng (kiểm bằng `simulateScene`); `pointer.move`/`hide` trên con trỏ chưa `show`; quá 4 con trỏ; op mảng trong cảnh không có `array`.
- Vượt giới hạn: 12 ô, 40 bước/cảnh, 8 op/bước, độ dài chuỗi.

**Cảnh báo (không chặn):** cảnh có `array` nhưng không có bước nào; cue dài (đoạn audio lớn hơn khoảng 6 giây) không có bước nào trong cảnh có mảng; cảnh có mảng mà `note` là thứ duy nhất thay đổi.

## 8. Job sinh animation

- Job `algorithm.animation.generate` giữ nguyên tên, đầu vào và cổng duyệt; revision mới có `contractVersion = 2` và `content.version = 2`.
- Prompt đưa: kịch bản đã duyệt (mô tả hình ảnh từng cảnh), lời giải, timeline (cảnh, cue với `cueId` và văn nói) và bộ op; yêu cầu mô tả **các bước tương ứng từng cue**, kèm hai ví dụ ngắn (một mảng tìm kiếm, một mảng hai con trỏ). Nội dung đề/code/lời thoại là dữ liệu không tin cậy.
- Vòng sửa máy tối đa 2 lượt: lỗi của `checkAnimationV2` được trả lại cho LLM; hết lượt thì job thất bại như hiện nay (`PermanentJobError`), không lưu bản lỗi.
- Model dùng theo quyết định chọn model (spec model-selection); lỗi hạ tầng LLM thử lại theo runner.
- Revision V1 cũ không bị sửa; muốn dùng engine mới thì sinh lại animation.

## 9. Render, preview và tương thích

- `AlgorithmVideo` chọn renderer cảnh theo `animation.version`: V1 giữ `Scene` cũ, V2 dùng cảnh mới. Phụ đề luôn theo cue qua `captions` và audio qua `audio` như hiện nay.
- Hợp đồng đọc: `AlgorithmAnimationSchema = union(V1, V2)` ở các chỗ đọc revision (`approveAlgorithmStage`, `prepareRender`, render job, UI); các hàm kiểm timeline chỉ dùng trường chung nên dùng được cho cả hai.
- Preview: `AnimationPreview` nhận `captions` và `audio` dựng ở server từ timeline và clip; trong Player audio phát bằng URL `/api/files/voice/<sha256>.wav` (`audioMode: "url"`), trong render bằng `staticFile` như hiện nay, để preview khớp bản render.
- Trang Animation hiển thị danh sách bước theo cảnh cho V2 (cue, op) bên cạnh preview.

## 10. Xử lý lỗi và biên

- Mảng quá 12 ô: lỗi kiểm tra (script nên minh họa một đoạn); không vẽ vỡ.
- Cảnh không có mảng: vẫn hợp lệ (chỉ tiêu đề, code, phụ đề), `steps` rỗng hoặc chỉ `note`/`clear`.
- Hai con trỏ trùng ô: nhãn xếp lệch, không che nhau.
- Cue rất ngắn: `T` co theo 60% lát, vẫn có khoảng giữ tối thiểu 1 frame.
- Revision V1 đang được duyệt/đang render không bị ảnh hưởng.
- Lỗi lưu có giới hạn độ dài; không lưu secret.

## 11. Kiểm chứng

Theo AGENTS.md luật 4–6: không viết, không chạy test. Dùng `npm run lint`, `npx tsc --noEmit`, `npm run build`, rồi kiểm bằng sản phẩm thật: sinh animation V2 cho một design có voice đã duyệt, render MP4, trích khung hình tại ranh giới từng bước (và giữa chuyển động) để xem con trỏ trượt, ô đổi màu, đổi chỗ; xem trong Player với audio; kiểm V1 cũ vẫn render. Báo cáo nêu rõ điều đã thấy thật, điều chưa, và đánh giá chất lượng một cách trung thực (không tuyên bố "đẹp" khi chưa xem).

## 12. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| LLM vẫn sinh bước nghèo nàn hoặc vô nghĩa | Ví dụ trong prompt, vòng sửa theo lỗi, cảnh báo cảnh tĩnh; kiểm bằng video thật và có thể chỉnh prompt |
| Bố cục vỡ với giá trị dài, nhiều con trỏ | Giới hạn 12 ô, 8 ký tự, 4 con trỏ; nhãn xếp lệch; xem khung hình thật |
| Hai đường V1/V2 làm rối mã | Dispatch một chỗ (theo `version`), mã V2 tách file riêng, V1 giữ nguyên |
| Engine chạy trong Player khác bản render | Dùng chung composition, props và `simulateScene`; xem cả hai |
| Chuyển động đổi chỗ che con trỏ/ghi chú | Thứ tự lớp cố định, xem khung hình ở giữa chuyển động |

## 13. Còn cần chốt trong plan

- Hằng số chuyển động (T, easing, độ nảy), cỡ chữ và khoảng cách cuối cùng, kiểm tương phản màu trên từng trạng thái.
- Nội dung chính xác của hai ví dụ trong prompt và cách đưa văn nói cue vào prompt.
- Tên file và ranh giới module (`src/lib/algorithm/animation/…`, `src/remotion/algorithm/…`), cách dựng `captions`/`audio` cho Player ở server.
- Đối chiếu API Remotion 4.0.537 cần dùng; cách đo chữ nếu cần co cỡ chữ ô.
- Thứ tự commit nhỏ đúng scope: hợp đồng và `simulateScene`; bộ kiểm tra; engine hiển thị; prompt và job; dispatch render; preview; tài liệu.

## 14. Kết quả triển khai và kiểm tay (2026-10-25)

Đã làm: `animation/{schema,simulate,check,playback,prompts}.ts`, `scene-v2.tsx` + `palette.ts`, dispatch theo `version` trong `video.tsx`, `animation-llm.ts` (vòng sửa máy), job/approve/prepareRender/render đọc union V1|V2 qua `checkAnimation`, `AnimationPreview` có audio và phụ đề theo cue, danh sách bước V2 trong trang Animation. `tsc`, eslint, `npm run build` đạt.

Chạy thật trên design `test` (voice đã duyệt): LLM sinh V2 hợp lệ ngay lần đầu (0 lượt sửa, 7.127 token), animation duyệt được, render 17–23 giây ra MP4 29,7 giây có audio. Đã xem khung hình: cảnh truy vết có mảng 10 ô, con trỏ `n` và `k`, bội của 3 chuyển đỏ, các số còn lại chuyển xanh, ghi chú đổi mờ dần, phụ đề đúng câu đang đọc; tấm ghép khung liên tiếp cho thấy màu mờ dần và ô phóng nhẹ.

Lỗi gặp khi chạy thật và đã sửa: bundle Remotion của job render thuật toán thiếu alias `@` (composition giờ import mã dùng chung lúc chạy); ghi chú ở cảnh không có mảng bị khối code che (đổi vị trí ghi chú và code cho cảnh không mảng).

Hạn chế trung thực: chỉ cảnh có `array` được diễn hoạt; ở video thử LLM chỉ dùng mảng cho một trong bốn cảnh, ba cảnh còn lại (mở đầu, công thức kèm code, tổng kết) chỉ có tiêu đề, một dòng ghi chú và code tĩnh nên vẫn thưa. Muốn cảnh công thức/code sinh động cần bôi dòng code và bảng biến (ngoài phạm vi v1). Chưa kiểm: Player chạy tới cuối với audio đồng bộ bằng tai, giao diện ở 360 px/chế độ tối, các op `cell.swap`, `cell.set`, `range.highlight`, `pointer.hide` (chưa được LLM dùng trong video thử), mảng nhiều ô gần 12, hai con trỏ cùng một ô, thử lại với model khác.
