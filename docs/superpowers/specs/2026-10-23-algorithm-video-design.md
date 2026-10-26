# Thiết kế: nhánh video giảng thuật toán lập trình thi đấu

- Ngày: 2026-10-23
- Trạng thái: **Bản nền được user duyệt ngày 2026-10-23; phần định hướng hình ảnh sáng, nhịp đọc nhanh và TTS được user duyệt bổ sung ngày 2026-10-24. Các thay đổi contract/schema/audio provider cụ thể vẫn phải được chốt trong plan trước khi triển khai.**
- Phạm vi tài liệu: yêu cầu nghiệp vụ, luồng duyệt, ranh giới dữ liệu và đề xuất kiến trúc. Kiểu/cột và hợp đồng bên dưới là đề xuất cần duyệt, không phải schema đang tồn tại.
- Liên quan: `2026-10-21-cartoon-pipeline-design.md`, `2026-10-21-series-project-design.md`, `2026-10-21-ai-casting-design.md` trong cùng thư mục; `docs/standards/asset-naming.md`.

## 1. Mục tiêu và quyết định đã chốt

Tạo một nhánh video giảng thuật toán, tách nghiệp vụ khỏi nhánh hoạt hình hiện tại. Khi tạo draft, người dùng chọn **loại video trước**, sau đó chọn **bộ phim (series) làm nguồn asset** và project chứa design.

Các quyết định được khôi phục từ phần trao đổi trước của thread:

1. Video tiếng Việt, định dạng dọc Shorts, tối đa 3 phút.
2. Dùng Remotion cho nhánh mới, không triển khai Manim ở phiên bản này.
3. Pipeline và state của nhánh mới tách khỏi pipeline hoạt hình; dùng chung series và kho asset.
4. Đề bài được nhập bằng text. Người dùng có thể cung cấp lời giải; nếu thiếu thì LLM sinh, chờ duyệt và sửa theo lý do từ chối.
5. Lời giải có thể là C++, Python, mã giả hoặc diễn giải thuật toán. Không bắt buộc chạy code lời giải.
6. LLM đề xuất combo giảng bài. Nếu không phù hợp, người dùng ghi lý do và chọn tay các thành phần thay vì bắt buộc sinh lại.
7. Kịch bản có cảnh, mô tả hình ảnh, lời thoại, phụ đề và nhân vật nếu cần; asset còn thiếu được sinh và đặt tên để tái sử dụng trong series.
8. Có cổng duyệt trước khi chuyển sang animation và sau khi xem video render.
9. Lưu phản hồi và kinh nghiệm để cải thiện lần sau. **Bài học playbook mới phải được duyệt trước khi được dùng**.
10. Tích hợp kiến thức crawler nằm ngoài phạm vi phiên bản đầu; chừa ranh giới mở rộng, không triển khai crawler hoặc kho tri thức ở lát này.
11. Hình ảnh thuật toán dùng phong cách sáng, thân thiện: nền kem ấm và chữ tương phản cao; cam/vàng làm điểm nhấn, xanh biểu thị dữ liệu/trạng thái hợp lệ, đỏ biểu thị phần bị loại/lỗi. Màu phải dùng nhất quán theo ý nghĩa, tránh nền tối hoặc tô quá nhiều màu cùng lúc.
12. Animation phải diễn giải từng bước thuật toán bằng chuyển động có mục đích và nhịp mượt: đưa dữ liệu vào, đánh dấu trạng thái, cập nhật bộ đếm/highlight, rồi chuyển cảnh. Giữ code và nội dung lời giải nguyên văn đã duyệt; không thực thi code.
13. Voiceover tiếng Việt là một phần đầu ra mong muốn. Ưu tiên TTS giọng tiếng Việt tự nhiên, trung tính; không clone giọng người thật. Giọng cần nghe thử/duyệt trước khi render video cuối.
14. Nhịp voiceover mặc định là **1,25× tốc độ nói bình thường**, có thể điều chỉnh từ **1,0× đến 1,5×**. Dùng nhịp chậm hơn cho công thức/code/truy vết cần theo dõi và nhanh hơn cho tóm tắt/chuyển tiếp; không tăng tốc tới mức giảm khả năng hiểu.
15. Timing scene và subtitle phải bám audio thực tế sau khi áp tốc độ: không cắt lời, không lệch subtitle, không dồn quá nhiều chữ lên một cue. Bản render chỉ được duyệt sau khi kiểm tra phát lại audio/video đồng bộ.

16. **TTS chạy local (user chốt 2026-10-24):** dùng **VieNeu-TTS v3 Turbo** (gói `vieneu` 3.8.3, Apache-2.0, ONNX Runtime trên CPU, không cần GPU), giọng sẵn **miền Nam** (nữ hoặc nam; chọn cụ thể sau khi nghe mẫu), **không clone giọng**, **không bật watermark** (không cài `vieneu[watermark]`). Không phát sinh chi phí theo ký tự và không gửi nội dung ra dịch vụ ngoài. Spike ngày 2026-10-24 đo RTF khoảng 0,25–0,28 trên i5-13600K; kết quả ở `docs/superpowers/spikes/2026-10-23-algorithm-video.md`. `infer()` của Turbo **không có tham số tốc độ**, nên tốc độ 1,25× (1,0×–1,5×) áp bằng time-stretch sau khi sinh; chất lượng giọng ở các mức này phải được người nghe duyệt trước khi dùng. Ghim đúng phiên bản `vieneu` vì danh sách giọng thay đổi giữa các bản SDK.

**Còn cần chốt trong implementation plan:** định dạng, nơi lưu, lifecycle và fingerprint audio; cách đọc ký hiệu toán/code thành lời cho TTS; cách đóng gói và chạy VieNeu (container riêng hay trong worker) cùng giới hạn tài nguyên khi render đồng thời; kiểm tra chất lượng giọng; chiến lược retry và timeout trong worker; timeline/action DSL và chuyển động cụ thể; palette token, typography, safe area và cỡ chữ tối thiểu. Thay đổi contract/schema/migration cụ thể vẫn cần được trình bày và duyệt trước khi thực hiện.

## 2. Hiện trạng repo đã đối chiếu

Repo `cartoon` là một ứng dụng Next.js ở gốc. Đối chiếu `package.json`, `package-lock.json`, `Dockerfile` và các file nguồn ngày 2026-10-23:

| Thành phần | Phiên bản/hiện trạng thực tế |
|---|---|
| Next.js / React | 15.5.28 / 19.1.0 |
| TypeScript / Tailwind CSS | 5.9.3 / 4.3.3 |
| Drizzle ORM / Kit | 0.45.4 / 0.31.11 |
| LangGraph / checkpoint Postgres / LangChain core | 1.5.1 / 1.1.0 / 1.2.19 |
| Remotion và các gói `@remotion/*` trực tiếp | 4.0.537 |
| Zod | 4.6.7 |
| Image worker / app | `node:22-bookworm-slim` / `node:22-alpine` |

Những ràng buộc hiện có:

- `videos` đang đại diện design và chứa `series_id`, `project_id`, `video_status` của hoạt hình; chưa có trường phân loại video.
- `assets` thuộc series, tên duy nhất trong series; `asset_variants` có trạng thái duyệt. Không được tra catalog toàn cục.
- `scripts`, `scenes`, `renders`, `asset_proposals` hiện liên kết về `videos`.
- `SceneDsl` hiện tại là **1920×1080, 30 fps**, phục vụ cảnh hoạt hình; không có primitive cho code, mảng, đồ thị thuật toán. Không đổi ngầm hợp đồng này sang video dọc.
- `scene-graph.ts` dùng LangGraph cho vòng máy viết/kiểm/chấm, không phải graph có duyệt người. Không được coi checkpoint hiện tại là đã hỗ trợ cổng duyệt mới.
- App và worker dùng chung Postgres, pgmq và storage; render hiện có ở worker. Worker xử lý tuần tự, nên không giữ job/khóa hàng đợi trong lúc chờ người duyệt.
- App hiện chưa có xác thực; môi trường publish không phải ranh giới an toàn để thực thi code tùy ý.

Công cụ `superpowers`, `understand-anything` và MCP `context7` không có trong catalog của phiên viết tài liệu này. Không tuyên bố đã chạy các công cụ đó. Các khẳng định thư viện được đối chiếu tài liệu chính thức ở §17; khả năng tương thích chính xác với phiên bản cài đặt cần spike trước khi triển khai. Chưa có test nào được viết hoặc chạy.

## 3. Phạm vi

### Trong phạm vi

- Chọn loại design khi tạo mới; tiếp tục hỗ trợ luồng hoạt hình cũ.
- Nhập đề, nhập/sinh/duyệt lời giải, đề xuất/chọn tay/duyệt combo.
- Sinh và chỉnh kịch bản theo cảnh; quản lý asset cần dùng sau khi có kịch bản nháp.
- Sinh đặc tả animation, xem preview, render MP4 và duyệt/sửa theo feedback.
- Lưu lịch sử bất biến, các liên kết nguồn và snapshot playbook cho mỗi lần sinh.
- LangGraph có persistence và vòng sửa lời giải; mọi cổng duyệt tồn tại bền vững trong DB.
- Quản lý đề xuất bài học playbook và duyệt trước khi áp dụng.

### Ngoài phạm vi phiên bản đầu

- Crawler, retrieval từ internet tự động, vector database hoặc fine-tuning.
- Chấm bài kiểu online judge, biên dịch/chạy C++ hoặc Python do người dùng/LLM cung cấp.
- Manim, chạy TSX/JavaScript/Python tùy ý do LLM sinh.
- Tự động đăng YouTube ngay sau render. Chỉ bàn giao video đã duyệt; việc nối upload hiện có là một lát sau cần xác nhận.
- Tự tạo nhạc, TTS hoặc đồng bộ khẩu hình trước khi có quyết định âm thanh riêng (§15).
- Chứng nhận lời giải đúng chỉ vì LLM judge đồng ý.

## 4. Luồng tổng thể và trải nghiệm

```text
Tạo draft: chọn loại → chọn series + project → nhập tiêu đề
  ├─ Hoạt hình: đi tiếp pipeline hiện có
  └─ Giảng thuật toán:
       Đề bài
         → Lời giải: nhập hoặc LLM đề xuất → người duyệt
         → Combo: LLM đề xuất → duyệt hoặc ghi lý do + chọn tay → duyệt
         → Kịch bản theo cảnh: sinh/chỉnh → xác định asset thiếu
         → Asset: tái sử dụng / sinh → duyệt và gắn vào kịch bản
         → Duyệt kịch bản + asset hoàn chỉnh
         → Đặc tả animation → kiểm máy → preview/render
         → Người duyệt video hoặc ghi feedback → sửa đúng lớp → render lại
         → Video hoàn tất

Mọi quyết định/phản hồi → lịch sử nguồn
                         → đề xuất bài học → duyệt playbook → dùng lần sau
```

Đề xuất tab: **Đề bài · Lời giải · Combo · Kịch bản · Asset · Animation · Video · Lịch sử**. Playbook có trang dùng chung và có liên kết từ từng feedback.

- Tab sau chưa đủ điều kiện vẫn xem được lịch sử, nhưng hành động sinh/duyệt bị chặn ở server.
- Không ép nhân vật xuất hiện. Video chỉ có text/code/đồ thị vẫn hợp lệ.
- Khi job đang chạy, giao diện cho biết revision đầu vào và trạng thái; không tự chuyển “đã duyệt”.
- Lỗi hạ tầng khác với nội dung bị người dùng từ chối. “Thử lại” không được ghi thành bài học rằng nội dung sai.
- Các bước có thể diễn ra qua nhiều phiên làm việc; refresh hoặc worker restart không mất lý do và quyết định.

## 5. Đề bài và lời giải

### 5.1 Đề bài

Người dùng nhập nguyên văn đề bài. Có thể bổ sung: nguồn/URL, input/output, constraints, ví dụ và ghi chú. Không bắt buộc LLM trích đầy đủ các phần từ text để được lưu draft.

- Thiếu dữ kiện quan trọng: yêu cầu bổ sung hoặc liệt kê giả định để người dùng duyệt; không tự bịa constraints, ví dụ hay kết quả.
- Giữ nguyên bản gốc; bản chuẩn hóa là dữ liệu có nguồn liên kết, không ghi đè text người dùng.
- Sửa đề sau khi đã duyệt lời giải tạo revision đề mới và vô hiệu hóa các duyệt downstream liên quan (§11).

### 5.2 Nội dung lời giải đề xuất

Một revision lời giải có:

- Loại biểu diễn: `cpp`, `python`, `pseudocode` hoặc `explanation`.
- Insight và thuật toán; mô tả các bước.
- Lập luận đúng đắn, độ phức tạp thời gian/bộ nhớ; có thể đánh dấu `not_applicable` với giải thích thay vì bịa số.
- Code/mã giả nếu có; ví dụ truy vết và ca biên dùng khi giảng.
- Giả định, điểm chưa chắc và nguồn tham chiếu nếu được người dùng cung cấp.
- Provenance: người nhập hay LLM; model, prompt version, input revision và playbook snapshot.

Lời giải người dùng nhập cũng cần **xác nhận dùng bản này** trước khi qua combo; không bắt buộc phải gọi LLM sửa lại.

### 5.3 Vòng LangGraph lời giải — đề xuất

```text
load approved context → write → check structure/consistency
  → advisory critique → settle
      ├─ sửa tự động có giới hạn → write
      └─ lưu candidate → human review interrupt → kết thúc lượt worker
            ├─ approve → khóa revision đã duyệt
            └─ reject(reason) → nạp feedback → write revision mới
```

- Check máy: cấu trúc, trường bắt buộc, tham chiếu nguồn, thiếu nội dung, bất nhất có thể phát hiện tất định. Không gắn nhãn “đã chạy mẫu” nếu chỉ suy diễn bằng LLM.
- Critique của LLM chỉ là khuyến nghị, không thay thế người duyệt hoặc chứng minh đúng đắn.
- Đề xuất tối đa 2 lượt sửa máy cho mỗi yêu cầu sinh. Hết lượt thì trình bản lỗi kèm issues, không lặp vô hạn. Người dùng có thể chủ động yêu cầu vòng mới.
- `thread_id` ổn định cho một workflow lời giải; job chạy/resume là các lần thực thi ngắn khác nhau. Không dùng `jobRunId` mới cho mỗi lần duyệt làm thread ID.
- Dùng checkpointer bền vững. Resume bằng đúng thread và đúng revision/interrupt đang chờ; chống hai yêu cầu resume đồng thời.
- Node chứa interrupt chỉ xây payload và chờ. Tách LLM call và ghi DB ra node khác; side effect nào có thể replay đều phải idempotent.
- Duyệt trong DB là nguồn sự thật nghiệp vụ, checkpoint là trạng thái thực thi. Lưu quyết định và enqueue resume trong cùng transaction; retry/reconciler xử lý trường hợp crash trước hoặc sau checkpoint.
- Worker kết thúc xử lý lượt queue khi đã persist trạng thái chờ. Không giữ visibility timeout trong nhiều giờ người dùng suy nghĩ.

## 6. Combo giảng bài

Combo là lựa chọn có cấu trúc cho **video cụ thể**, không phải một tổ hợp cố định bắt buộc áp dụng cho mọi bài. Danh mục do người dùng cung cấp là taxonomy sản phẩm, không tuyên bố nghiên cứu xác nhận chính xác số lượng loại.

| Thành phần | Các lựa chọn ban đầu |
|---|---|
| Hook (8) | câu hỏi tò mò; nêu vấn đề; lỗi thường gặp; thử thách/dự đoán; kết quả bất ngờ; demo trước; phá hiểu lầm; tình huống ứng dụng/câu chuyện ngắn |
| Mục tiêu (6) | hiểu khái niệm; truy vết code; viết code; tìm/sửa lỗi; so sánh cách giải; phân tích/tối ưu hiệu năng |
| Đặt bài toán (5) | đề bài; tình huống thực tế; lỗi cần sửa; ràng buộc hiệu năng; quan niệm sai cần kiểm tra |
| Mạch chính (6) | khái niệm → ví dụ → áp dụng; bài toán → insight → thuật toán → code; bug → tái hiện → chẩn đoán → sửa; mục tiêu → xây dựng → kiểm thử → mở rộng; so sánh → chọn phương án → triển khai; dự đoán → truy vết → tổng quát hóa |
| Minh họa (5) | ví dụ làm mẫu; truy vết; sơ đồ/animation; đối chiếu đúng/sai; dữ liệu/giá trị biến |
| Code (5) | viết từng phần; code hoàn chỉnh rồi phân tích; live-coding dạng minh họa; điền phần thiếu; sửa code sai rồi đối chiếu |
| Người xem thực hành (5) | đoán output; điền bước tiếp; tìm bug; đổi input/điều kiện; bài tương tự |
| Kiểm chứng (5) | ca mẫu; ca biên; lập luận đúng; độ phức tạp; đối chiếu output |
| Kết thúc (4) | tóm tắt; hỏi để nhớ; biến thể tự làm; thử thách/bài tiếp theo |

Quy tắc đề xuất:

1. LLM đề xuất một combo cùng lý do phù hợp với lời giải, mục tiêu quan sát được, dàn ý và ngân sách thời lượng.
2. Hook, mục tiêu, mạch chính và kết thúc bắt buộc. Thành phần khác được bỏ qua có lý do; không ép 9 cảnh hoặc mỗi thành phần một cảnh.
3. Một component có ID ổn định, label hiển thị và taxonomy version. Không lưu chỉ bằng text label có thể đổi.
4. Khi từ chối combo: lý do bắt buộc; UI mở bộ chọn tay đã điền lựa chọn cũ. Lưu cả đề xuất cũ, lý do, lựa chọn mới và quyết định duyệt mới.
5. Chọn tay không cần chờ LLM. Cho người dùng sửa dàn ý/ngân sách cùng lúc; kiểm cấu trúc và tổng thời lượng trước khi xác nhận.
6. Các mục “live coding”, “chạy ca mẫu” mô tả cách trình bày video. Chúng không bật quyền thực thi code trong backend. Output chưa chạy phải được ghi rõ nguồn suy luận/xác nhận.
7. Không tự biến quyết định một bài thành quy tắc toàn cục; bước tổng quát hóa đi qua playbook (§10).

## 7. Kịch bản theo cảnh và asset

### 7.1 Kịch bản nháp

Đầu vào gồm đề, lời giải và combo đã duyệt; catalog đúng series; playbook đã duyệt trong phạm vi script. Đầu ra đề xuất `AlgorithmScriptV1` tách khỏi `ScriptV1` hoạt hình.

Mỗi cảnh chứa:

- ID ổn định, thứ tự, mục đích và thành phần combo được thực hiện.
- Mô tả cảnh/hành động trên màn hình.
- Các cue lời thoại tiếng Việt, speaker tùy chọn; narrator không bắt buộc có asset nhân vật.
- Cue phụ đề tách biệt nhưng có liên kết đến lời thoại tương ứng; không tự ý đổi ý nghĩa khi rút gọn.
- Nội dung code, biểu thức, dữ liệu minh họa hoặc trạng thái thuật toán được tham chiếu bằng ID.
- Asset có sẵn cần dùng, và yêu cầu asset còn thiếu bằng khóa tạm.
- Thời lượng dự kiến theo frame và các điểm cần đồng bộ lời/hình.

Kịch bản hiển thị hai cột **Lời nói/phụ đề** và **Hình ảnh/thao tác**; có thể chỉnh trực tiếp từng cảnh. Bản nháp được phép tham chiếu yêu cầu asset chưa giải quyết; **bản được duyệt cuối không được phép**.

### 7.2 Xử lý asset sau khi có kịch bản nháp

- Tra cứu catalog đã duyệt theo `seriesId` trước khi đề xuất nhân vật/asset mới. Không sinh nhân vật chỉ để lấp quota.
- Asset mới dùng hệ thống sinh ảnh gốc/biến thể hiện có; không tạo kho nhân vật riêng cho nhánh này.
- Giữ chuẩn `chr_`, `bg_`, `prop_`, `fx_`, tên ASCII tối đa 40 ký tự và tính duy nhất trong series. Tên hiển thị tiếng Việt là trường riêng.
- Khóa tạm trong script được map sang asset ID/tên đã chốt sau khi duyệt; lưu mapping, không thay text bằng phép replace tùy tiện.
- Duyệt ảnh gốc rồi mới sinh biến thể cần ảnh tham chiếu. Có thể loại/sinh lại với lý do hoặc bỏ yêu cầu sau khi sửa script không còn dùng nó.
- Nhánh mới cần bảng yêu cầu asset riêng hoặc lớp tổng quát hóa đã được duyệt; không ghi thẳng vào `asset_proposals` cũ nếu việc đó kích hoạt cổng casting hoạt hình.
- Mọi asset/biến thể dùng trong bản script cuối phải tồn tại, đúng series và đã duyệt. Xác nhận lại tại lúc enqueue và lúc worker bắt đầu animation/render.
- `bg` hiện mô tả nền 16:9 trong chuẩn asset. Đề xuất chưa đổi chuẩn này: video dọc dùng nền vector/màu mặc định, hoặc dùng ảnh có cấu hình fit/crop rõ ràng và được duyệt qua preview; không tự kéo méo nền 16:9.

### 7.3 Cổng duyệt kịch bản hoàn chỉnh

Chỉ mở khi không còn yêu cầu asset chưa giải quyết, mọi cue hợp lệ và thời lượng phù hợp. Người dùng duyệt đúng revision kịch bản cùng manifest asset, không chỉ duyệt phần text.

## 8. Animation và render — đề xuất cần duyệt

### 8.1 Chọn hợp đồng an toàn cho phiên bản đầu

**Đề xuất: LLM sinh JSON `AlgorithmAnimationV1`, Remotion renderer cố định diễn giải; không chạy TSX do LLM sinh.**

Lý do:

- Giữ preview và render kiểm soát được, kiểm máy trước khi chạy.
- Không đưa code tùy ý vào app/worker đang có credential DB và router.
- Dễ khóa nội dung lời giải và chỉ sửa cách trình bày theo feedback.

Đây là thay đổi cách hiện thực “LLM viết code animation”; cần user duyệt riêng. Nếu cần code tự do ở phiên bản sau, phải có spec sandbox riêng: cô lập khỏi app/worker chính, không secret, không network tùy ý, filesystem/resource/time limits. Không coi bundle thành công là code an toàn; tài liệu Remotion security không cung cấp một sandbox thực thi code không tin cậy.

### 8.2 Hợp đồng dự kiến

- `version: 1`, composition **1080×1920, 30 fps**; tổng 1–5400 frame. Đây là mặc định sản phẩm đề xuất, không phải yêu cầu bắt buộc của YouTube.
- Danh sách cảnh, các object có ID duy nhất, timeline cue và manifest asset đã duyệt.
- Primitive đề xuất: text/heading, code panel với highlight dòng, array/table, node-edge graph, pointer/marker, shape và image asset.
- Code chỉ được render như text; không eval, không shell, không import tùy ý. Text/biểu thức không trở thành HTML hoặc script thực thi.
- Animation chỉ dùng action trong allowlist: xuất hiện/ẩn, dịch chuyển, đổi màu, highlight và chuyển trạng thái; thông số hữu hạn, interval nằm trong cảnh.
- Thoại/phụ đề lấy từ cue kịch bản đã duyệt bằng ID. LLM animation không được tự viết lại lời giải, câu thoại hoặc output.
- Mỗi trace trỏ tới dữ liệu minh họa đã duyệt. Nếu cần thêm dữ liệu mới thì quay về kịch bản để duyệt, không lén đưa vào ở lớp animation.
- Asset là tham chiếu nội bộ đã phân giải, không nhận URL tùy ý hoặc đường dẫn do model cung cấp.
- Safe area, font-size tối thiểu, số dòng code và khả năng vẽ graph là tiêu chí phải xác định bằng spike preview dọc; không bịa giới hạn là tiêu chuẩn chung.
- Art direction đã được user duyệt bổ sung ngày 2026-10-24: nền kem sáng; màu mực đậm cho chữ chính; cam/vàng cho điểm nhấn và tiến trình; xanh cho dữ liệu hợp lệ; đỏ cho phần bị loại/cảnh báo. Màu được dùng theo semantic token nhất quán, không dùng nền tối làm chủ đạo.
- Chuyển động cần gắn với sự kiện thuật toán: xuất hiện tuần tự dữ liệu, loại/đánh dấu phần tử, cập nhật pointer/count, highlight code line tương ứng và chuyển trạng thái. Mỗi cue phải có khoảng giữ để đọc; tránh chuyển động trang trí liên tục hoặc chuyển cảnh làm mất thông tin.
- Timeline narration/subtitle phải tham chiếu cue đã duyệt. Nhịp voiceover mặc định 1,25× (điều chỉnh 1,0×–1,5×); công thức, code và truy vết cần thời lượng đủ để theo dõi. Sau TTS, kiểm tra timing bằng audio thật và kiểm tra subtitle không bị cắt/che.

### 8.3 Kiểm máy, preview và render

1. Parse hợp đồng, kiểm tham chiếu, thời gian, bounds và limits kỹ thuật.
2. Kiểm không có cue thiếu/trùng, không đổi nội dung đã duyệt; manifest asset đủ và đúng series.
3. Tạo preview từ composition chuyên biệt cho thuật toán. Không sửa `SceneDsl v1` hoặc composition hoạt hình để dùng chung bằng cờ ngầm.
4. Render bằng infrastructure Remotion hiện có, nhưng dispatch theo loại design. Pin cùng phiên bản Remotion, snapshot renderer version/asset manifest.
5. Lưu MP4 mới với ID mới, duration/frame count, log lỗi đã lọc secret và liên kết input revision. Lỗi không ghi đè file render đã duyệt.
6. Render xong là **chờ duyệt**, không tự hoàn tất. Người dùng xem video và duyệt đúng render ID.

Render/job dài gia hạn khóa theo cơ chế worker hiện có; không áp dụng điều này cho chờ người duyệt. Không thêm hàng đợi render song song trong lát đầu nếu chưa đánh giá tài nguyên.

## 9. Duyệt video và sửa đúng lớp

Feedback phải gắn với render/revision cụ thể; người dùng có thể thêm cảnh hoặc mốc thời gian để định vị.

| Vấn đề | Quay về | Phần phải duyệt lại |
|---|---|---|
| Font, layout, tốc độ highlight, chuyển cảnh | Animation | Animation mới và video mới; giữ duyệt nội dung nếu không đổi |
| Thoại, phụ đề, ví dụ, thứ tự giải thích | Kịch bản | Kịch bản + asset bị ảnh hưởng, animation và render |
| Hook/mục tiêu/mạch giảng sai | Combo | Combo và mọi downstream |
| Thuật toán, chứng minh, code hoặc độ phức tạp sai | Lời giải | Lời giải và mọi downstream |
| Thiếu/sai đề bài hoặc constraints | Đề bài | Mọi downstream |
| Asset chưa phù hợp | Asset/kịch bản | Binding asset và preview/render liên quan |

Không tự sửa lời giải ở lớp animation. Khi phân loại feedback không chắc chắn, yêu cầu người dùng chọn lớp cần sửa thay vì gọi model sửa toàn bộ pipeline.

## 10. Playbook: lưu lịch sử khác với học kinh nghiệm

### 10.1 Hai lớp dữ liệu

**A. Sự kiện nguồn:** lưu ngay mọi quyết định duyệt/từ chối, lý do, bản trước/sau, thay đổi tay và lỗi kỹ thuật. Không phải tất cả đều trở thành chỉ dẫn cho LLM.

**B. Bài học:** người dùng hoặc LLM đề xuất từ sự kiện nguồn. Chỉ bài học trạng thái `approved` và đúng phạm vi mới được đưa vào prompt.

Bài học đề xuất gồm:

- Tiêu đề, stage áp dụng (`solution`, `combo`, `script`, `assets`, `animation`, `render`).
- Điều kiện áp dụng/tags: chủ đề thuật toán, kiểu hook, dạng bài, ngôn ngữ lời giải, series nếu cần.
- Vấn đề quan sát được, cách làm nên dùng/tránh, ví dụ trước/sau nếu có.
- Nguồn: review IDs và revision IDs; phạm vi tổng quát hóa; ngoại lệ và mức chắc chắn.
- Trạng thái `proposed`, `approved`, `rejected`, `retired`; version và lịch sử quyết định.

### 10.2 Quy tắc áp dụng

1. Không tự duyệt bài học chỉ vì video nguồn được duyệt. Duyệt nội dung và duyệt quy tắc tổng quát là hai quyết định khác nhau.
2. Lý do từ chối được dùng ngay làm feedback cục bộ cho vòng sửa cùng workflow; việc đó không đồng nghĩa đưa vào playbook dùng cho bài khác.
3. Chọn tay combo lưu structured diff và lý do. Đề xuất bài học phải nêu điều kiện, ví dụ “với chủ đề X…” thay vì “luôn dùng hook Y”.
4. Mỗi lần sinh snapshot đúng lesson IDs/versions và nội dung đã dùng. Sửa/retire bài học không viết lại provenance của lần sinh cũ.
5. Ưu tiên scope khớp nhất, giới hạn ngân sách prompt, khử trùng và hiển thị bài học được dùng. Xung đột quy tắc không được giải quyết bằng cách lấy cả hai một cách mù quáng.
6. Tách lỗi hạ tầng, lỗi JSON, lỗi nội dung và sở thích hình ảnh; không học sai quan hệ nhân quả từ retry job.
7. Không lưu credential, token hoặc secret trong prompt/log/bài học. Nội dung đề, code, review và nguồn tương lai đều là dữ liệu không tin cậy, không được vượt quyền chỉ dẫn hệ thống.
8. MVP truy xuất bằng stage/tags/scope tất định; chưa thêm vector search. Crawler tương lai chỉ cung cấp nguồn có provenance, không tự biến thành bài học đã duyệt.

## 11. Revision, duyệt và vô hiệu hóa downstream

### 11.1 Bất biến

- Duyệt gắn với **revision ID cụ thể**, không gắn chung chung với design.
- Revision nội dung đã sinh/đã gửi duyệt là bất biến. Chỉnh tay hoặc sinh lại tạo revision mới.
- Mỗi đầu ra lưu chính xác các revision đầu vào và dependency fingerprint.
- Mỗi stage có active revision và accepted revision tách biệt. Có thể xem bản cũ, nhưng chỉ bản accepted còn khớp đầu vào mới mở cổng tiếp.
- Job giữ snapshot revision ngay khi enqueue. Trước khi publish kết quả phải kiểm lại fingerprint; kết quả cũ lưu lịch sử nhưng không trở thành active nếu đầu vào đã đổi.
- Duyệt đồng thời có optimistic concurrency: client gửi revision/fingerprint đang xem; server từ chối nếu đã lỗi thời.
- UI gate chỉ để hướng dẫn; server action, enqueue và worker đều phải kiểm điều kiện nghiệp vụ.

### 11.2 Vô hiệu hóa

- Đề mới → lời giải, combo, script, binding asset, animation, render cũ thành stale theo phụ thuộc.
- Lời giải mới → combo trở đi stale.
- Combo mới → script trở đi stale.
- Script mới → binding và animation/render cần tính lại; có thể tái dùng asset đã duyệt, nhưng phải xác nhận manifest mới.
- Binding/ảnh dùng mới → animation/render có manifest cũ không còn là bản hiện hành.
- Animation mới → render cũ không được coi là output của animation mới.
- Không xóa bản cũ hoặc sửa review cũ. “Stale” là trạng thái quan hệ phụ thuộc, không biến quyết định duyệt lịch sử thành từ chối.
- Playbook mới không tự vô hiệu hóa video đang làm; chỉ thay đổi khi người dùng yêu cầu sinh lại với context mới.

## 12. Mô hình dữ liệu đề xuất — cần duyệt trước migration

Chọn **một design envelope chung, state nghiệp vụ riêng**: giữ `videos` để bảo toàn cây project, series và các FK hiện có; thêm discriminator, không dùng enum trạng thái hoạt hình cho các bước thuật toán.

### 12.1 Thay đổi tối thiểu phần chung

- `videos.kind`: `cartoon` hoặc `algorithm`, backfill dữ liệu cũ = `cartoon`.
- Đề xuất `videos.status` cho phép NULL và có check theo kind: cartoon phải có trạng thái cũ; algorithm phải NULL. Mọi truy vấn/handler hoạt hình phải lọc kind; không dựa vào default cũ để tạo algorithm.
- UI/cây project hiển thị trạng thái qua dispatcher theo kind. Không cho đổi kind sau khi đã tạo artifact; chuyển loại cần draft mới.
- Không đổi ý nghĩa `scripts`, `scenes`, `renders`, `combos` hoặc `asset_proposals` cũ. Nhánh algorithm không ghi vào các bảng nội dung hoạt hình đó.
- Nếu khi triển khai chọn phương án envelope khác, cần cập nhật và duyệt lại spec thay vì tự thay đổi schema trong quá trình code.

### 12.2 Các bảng nghiệp vụ mới dự kiến

| Bảng đề xuất | Vai trò và ràng buộc chính |
|---|---|
| `algorithm_workflows` | PK/FK `video_id`, stage hiện hành, active/accepted pointers, concurrency version; chỉ liên kết design kind algorithm |
| `algorithm_revisions` | ID, video ID, stage, số version, contract version, content JSONB, nguồn human/LLM, generation status, model/prompt metadata, dependency fingerprint, created_at; unique `(video_id, stage, version)` |
| `algorithm_revision_inputs` | Liên kết output revision với input revision bất biến; FK thực, chống trỏ sang design khác ở application/transaction và constraint phù hợp |
| `algorithm_decisions` | Quyết định append-only trên revision hoặc output cụ thể, approve/reject, reason, expected fingerprint; reject bắt buộc reason |
| `algorithm_asset_requests` | Script revision, temporary key, asset/state, brief, quyết định, binding; unique theo script revision + key; không sửa quy tắc casting hoạt hình |
| `algorithm_outputs` | Animation revision, input fingerprint, renderer version, asset manifest/hashes, đường dẫn MP4, frame count, trạng thái sinh/duyệt và lỗi đã lọc |
| `playbook_lessons` | Nội dung, stage/tags/scope, version, trạng thái, nguồn sự kiện; bản approved bất biến, sửa tạo version mới |
| `playbook_lesson_sources` | Liên kết lesson/version đến các quyết định/revision nguồn, bảo toàn nguồn gốc |
| `generation_playbook_snapshots` | Revision/generation ID và danh sách lesson versions cùng nội dung thực tế đã dùng |
| `algorithm_generation_runs` | Workflow/thread ID, request key, stage, input snapshot, retry/interrupt state, job liên quan; unique request key chống enqueue trùng |

Tên bảng và chi tiết cột cần được cụ thể hóa trong plan sau khi duyệt kiến trúc; không được bỏ các ràng buộc quan hệ/revision trên chỉ vì dùng JSONB.

### 12.3 Dùng chung hạ tầng

- Tái sử dụng pgmq, storage và job logs. Đề xuất thêm target types cho workflow/revision/output/playbook khi dùng `job_runs`, `reviews` hoặc `validations`; không giả mạo `target_type=script` với ID bảng khác.
- Tránh hai nguồn quyết định: quyết định nhánh algorithm ở `algorithm_decisions`; nếu dùng `reviews` chung thay thế thì plan phải chọn **một** nguồn chuẩn và cập nhật quan hệ, không ghi song song không có quy tắc nhất quán.
- FK tới series/project tiếp tục qua design; xóa series/project bị chặn khi còn design như hiện tại. Không triển khai hard-delete workflow có lịch sử ở MVP.
- Checkpoint LangGraph giữ schema riêng của saver, không thay thế bảng nghiệp vụ.
- Enum mới/migration được sinh và xem SQL bằng Drizzle theo plan đã duyệt. Không tự chạy migration lên DB khi chỉ được yêu cầu viết spec.

## 13. Hợp đồng LLM và job

Đề xuất các contract riêng: `AlgorithmSolutionV1`, `AlgorithmComboV1`, `AlgorithmScriptV1`, `AlgorithmAnimationV1`, `PlaybookLessonProposalV1`. Mỗi contract cần version, strict validation và giới hạn payload/token/đối tượng; con số kỹ thuật cụ thể chốt trong plan/spike.

- Không đổi contract 9router hiện có để đạt tính năng này. Dùng chat client chung; validate response tại boundary, không tin model tự tuân thủ JSON.
- Prompt tách chỉ dẫn hệ thống khỏi đề bài, code, feedback và playbook; không nhận tool/import/URL đặc quyền từ model.
- Job đề xuất: `algorithm.solution.generate`, `algorithm.solution.resume`, `algorithm.combo.propose`, `algorithm.script.generate`, `algorithm.animation.generate`, `algorithm.video.render`, `playbook.lesson.propose`.
- Tạo hàng revision/run trước enqueue, trong cùng transaction; job nhận ID và fingerprint thay vì toàn bộ dữ liệu mutable.
- Duyệt/chọn tay là server action, không bắt buộc job. Không enqueue bước kế tiếp trước khi transaction duyệt đã commit.
- Unique request key + check trạng thái đảm bảo retry không tạo nhiều revision, nhiều asset request hoặc nhiều output hiện hành.
- Không tuyên bố exactly-once cho LLM call: crash có thể gây gọi lặp; idempotent persistence và reconciliation phải ngăn tác dụng lặp ở DB.
- Mọi run lưu model thực tế, prompt/contract version, input IDs, playbook snapshot và thời gian. Không thay model mặc định hoặc thêm dependency mới chỉ để viết spec.
- Timeout, hạ tầng retry và machine revision là các bộ đếm khác nhau. Human reject tạo vòng sửa nghiệp vụ mới, không tiêu retry budget vì lỗi mạng.

## 14. Phụ đề và thời lượng

Mặc định đề xuất cho nhánh tiếng Việt: **17 ký tự/giây, tối đa 42 ký tự mỗi dòng, tối đa 2 dòng, mỗi cue 5/6–7 giây**, tham khảo hướng dẫn Vietnamese standard subtitles của Netflix; đây là tiêu chí đọc của sản phẩm, không phải yêu cầu Shorts.

- Tại 30 fps: cue tối thiểu 25 frame, tối đa 210 frame; phải kiểm từng dòng, không chỉ tổng 84 ký tự.
- Định nghĩa đếm ký tự/chuẩn hóa Unicode và xuống dòng cần chốt trong hợp đồng, dùng thống nhất giữa validator và UI.
- Nội dung code trên màn hình không được nhét hết vào phụ đề. Không tăng tốc đọc để ép bài quá dài vào 3 phút.
- Nếu không thể trình bày lời giải đã duyệt trong ngân sách: báo vấn đề và cho người dùng rút gọn phạm vi/đổi combo/script. Không tự bỏ giả định, ca biên hoặc lời giải thích quan trọng.
- Không đổi giới hạn 20 ký tự/giây của pipeline cũ trong lát này. Profile phụ đề tiếng Việt là cấu hình riêng của nhánh mới.
- Thời lượng thoại ban đầu là dự kiến từ text. Sau khi TTS sinh audio và tốc độ đọc được áp dụng, phải tính timing lại theo audio thực tế; không gắn nhãn đã đồng bộ trước khi kiểm tra.
- Tốc độ voiceover mặc định 1,25×, tùy chỉnh trong khoảng 1,0×–1,5× theo yêu cầu đã duyệt ngày 2026-10-24. Tốc độ chỉ điều chỉnh giọng đọc, không được rút bớt nội dung học thuật hoặc ép subtitle vượt profile dễ đọc.

## 15. Các lựa chọn cần user duyệt

1. **Kiến trúc dữ liệu:** design envelope `videos.kind`, state algorithm riêng và `videos.status = NULL` cho algorithm như §12; giữ dữ liệu hoạt hình nguyên nghĩa.
2. **Animation:** JSON declarative + Remotion renderer cố định ở MVP, thay vì chạy code TSX tự do do LLM sinh (§8).
3. **Âm thanh/TTS:** người dùng đã duyệt định hướng có voiceover TTS tiếng Việt trung tính, không clone giọng. Tốc độ mặc định 1,25×, có thể chỉnh 1,0×–1,5×. Đã chốt ngày 2026-10-24: TTS local VieNeu-TTS v3 Turbo, giọng miền Nam, không watermark, đổi tốc độ bằng time-stretch (mục 16 phần §1). Cách đóng gói, lưu audio, đọc ký hiệu toán/code, retry và kiểm tra chất lượng vẫn phải chốt trong implementation plan trước khi tích hợp vào app.
4. **Duyệt người qua LangGraph:** đề xuất graph lời giải dùng durable interrupt/resume kết hợp quyết định DB; các stage còn lại dùng job ngắn + gate DB, không một graph dài ôm toàn pipeline.
5. **Mặc định hình/thời gian:** 1080×1920, 30 fps, trần 5400 frame và profile phụ đề §14.
6. **Đầu ra phiên bản đầu:** MP4 được duyệt và tải/xem được; nối upload YouTube để lát sau.

Các lựa chọn này là đề xuất trong bản nháp, không được diễn giải thành đã approve từ yêu cầu “tiếp tục viết spec”.

## 16. Tiêu chí nghiệm thu và lộ trình sau khi duyệt

### 16.1 Tiêu chí nghiệm thu nghiệp vụ

- Design hoạt hình cũ tiếp tục mở đúng pipeline; tạo draft bắt buộc chọn loại trước và không trộn trạng thái hai loại.
- Algorithm draft chọn đúng một series và project; mọi asset phân giải trong series đó.
- Có thể nhập lời giải không gọi model; hoặc sinh, từ chối kèm lý do, sửa và duyệt qua nhiều phiên mà không mất lịch sử.
- Combo bị từ chối cho chọn tay ngay; giữ cả bản đề xuất, lý do và bản thay thế đã duyệt.
- Kịch bản có liên kết lời/hình/phụ đề, có thể không dùng nhân vật. Asset thiếu được giải quyết trước cổng duyệt cuối.
- Không sinh animation từ script chưa duyệt hoặc phụ thuộc stale. Animation không đổi nội dung đã duyệt.
- Render mới không ghi đè render cũ; video chỉ hoàn tất sau duyệt đúng output.
- Sửa đầu vào làm gate downstream đóng đúng quy tắc; phản hồi của job cũ không chiếm active revision mới.
- Bài học chưa duyệt/đã retire không lọt vào lần sinh mới; snapshot cũ vẫn xem được.
- Queue retry/restart, duplicate submit và interrupt resume không tạo nhiều quyết định hoặc artifact hiện hành.
- Không thực thi code lời giải hoặc code LLM tùy ý; không thêm crawler/TTS/upload ngầm.

Danh sách trên là tiêu chí sản phẩm, **không phải sự cho phép viết hoặc chạy test**. Nếu user muốn test, phải lập test plan riêng và đợi duyệt theo AGENTS.md.

### 16.2 Lộ trình đề xuất, chưa phải implementation plan được duyệt

- **S0 — Spike/khóa hợp đồng:** xác minh interrupt/resume với các phiên bản LangGraph đang cài; prototype preview code/array/graph dọc; chốt giới hạn layout, Unicode và audio. Không tự viết/chạy file test.
- **S1 — Design kind và revision nền:** migration đã duyệt, routing theo loại, nhập đề/lời giải thủ công, quyết định duyệt và invalidation. Kiểm tác động tới cây project và toàn bộ query/handler cũ.
- **S2 — Lời giải AI và playbook:** graph durable, feedback cục bộ, đề xuất/duyệt bài học và snapshot.
- **S3 — Combo:** taxonomy versioned, đề xuất AI, sửa/chọn tay và lịch sử.
- **S4 — Script và asset:** kịch bản hai cột, binding/yêu cầu asset và cổng duyệt cuối.
- **S5 — Animation và video:** DSL riêng, renderer cố định, preview/render/review và sửa theo lớp.

Sau khi user duyệt spec, viết implementation plan theo từng lát, gồm danh sách file, migration/contract cụ thể, nguồn chính thức và cách xác minh được phép. Chỉ triển khai sau khi plan được duyệt. Lint, typecheck và build được phép; test không được tự thêm/chạy.

## 17. Nguồn chính thức đã đối chiếu khi viết

1. LangGraph JS — interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
   - Checkpointer, thread ID, resume cùng thread; node restart khi resume; side effect trước interrupt phải idempotent. Đây là lý do tách node sinh/ghi khỏi node chờ và phải spike reconciliation.
2. Remotion Player: https://www.remotion.dev/docs/player
   - Player nhúng playback trong React. Trang này không đủ để chứng minh mọi primitive dự kiến đều render giống nhau ở worker; cần spike trên version 4.0.537.
3. Remotion security: https://www.remotion.dev/docs/security
   - Cảnh báo lộ dữ liệu môi trường, bảo vệ endpoint render và rủi ro dependency. Trang không đưa ra sandbox chạy code không tin cậy; lựa chọn DSL ở đây là quyết định kiến trúc đề xuất của dự án.
4. YouTube Help — three-minute Shorts: https://support.google.com/youtube/answer/15424877?hl=en
   - Square/vertical tối đa 3 phút. Shorts dài hơn 1 phút có copyright claim còn hiệu lực có thể bị chặn toàn cầu; không suy ra app đã hỗ trợ audio hoặc quyền sử dụng nhạc.
5. Netflix — Vietnamese Timed Text: https://partnerhelp.netflixstudios.com/hc/en-us/articles/220447048-Vietnamese-Timed-Text-Style-Guide
   - Standard subtitle người lớn: tối đa 17 ký tự/giây; 42 ký tự/dòng, tối đa 2 dòng. Không nhầm với SDH người lớn 20 ký tự/giây hoặc nội dung trẻ em.
6. Netflix — General Requirements: https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617-Timed-Text-Style-Guide-General-Requirements
   - Cue 5/6–7 giây; tối đa 2 dòng.

Các link nghiên cứu giáo dục do user cung cấp là bối cảnh cho taxonomy, không được dùng trong tài liệu này để khẳng định 8 hook/9 thành phần là chuẩn nghiên cứu bắt buộc. Không thêm khẳng định học thuật chưa được xác minh.
