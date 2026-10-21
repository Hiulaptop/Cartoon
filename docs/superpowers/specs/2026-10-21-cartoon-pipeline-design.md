# Thiết kế: Pipeline làm phim hoạt hình tự động (lát cắt đầu)

- Ngày: 2026-10-21
- Trạng thái: chờ user duyệt spec
- Phạm vi spec: kiến trúc và lát cắt đầu (M0–M7). Mỗi mốc có plan triển khai riêng. Các phần "sau lát cắt đầu" chỉ được mô tả hình dạng, sẽ có spec riêng.

## 1. Mục tiêu

Một tool sản xuất video hoạt hình 2D tiếng Anh cho YouTube, gồm 7 flow: (1) sinh và duyệt asset, (2) viết kịch bản, (3) viết phân cảnh, (4) sinh cảnh, (5) âm thanh, (6) ghép video, (7) duyệt và upload YouTube. Mọi bước có người duyệt; tự động hóa được làm sâu dần sau.

**Mốc hoàn thành lát cắt đầu:** một video 1–2 phút đi hết 7 flow gần như tự động (LLM ở mỗi bước, người chỉ bấm duyệt) và được upload lên YouTube ở chế độ riêng tư.

**Ngoài phạm vi lát cắt đầu:** combo và ACE (chỉ thiết kế hình dạng), âm thanh, rig nhân vật, đăng nhập, nhiều worker hoặc render trên cloud, OAuth tự động, học từ số liệu xem YouTube, test tự động (xem mục 10).

## 2. Quyết định đã chốt

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Định dạng | Chủ yếu video ngang 16:9, 3–10 phút, 2D cắt ghép. Lát cắt đầu: 1–2 phút. |
| 2 | Dạng asset | Bộ ảnh theo trạng thái trước; thiết kế để thêm rig tách lớp sau mà không sửa bảng cũ. DB lưu ảnh gốc và mô tả. |
| 3 | Nhà cung cấp model | Mọi model gọi qua 9router (văn bản và ảnh). |
| 4 | Tên asset | Theo chuẩn `docs/standards/asset-naming.md`; LLM chỉ tham chiếu bằng tên. |
| 5 | Người dùng | Một người vận hành, **không có đăng nhập**. DB vẫn lưu lịch sử duyệt và cột "kênh". |
| 6 | Khán giả | Tiếng Anh, **14–18 tuổi**, mức nội dung tối đa **TV-14**, upload với `made_for_kids = false`. |
| 7 | Render | Worker riêng nhận job từ hàng đợi, chạy trên máy người vận hành; quy mô 1 video/ngày, thiết kế để lên 10–100 video/ngày. |
| 8 | Chiến lược | Lát cắt mỏng chạy hết đường trước, làm sâu từng bước sau. |
| 9 | Sinh cảnh | Chỉ dùng Remotion, không dùng model sinh video. |
| 10 | LLM điều khiển Remotion | LLM viết **JSON theo khuôn cố định**; bộ component Remotion viết sẵn dựng hình. Sau này mở rộng bằng component tùy biến có duyệt. |
| 11 | Lưu file | Thư mục `./data/` ở gốc repo, nằm trong `.gitignore`. |
| 12 | Supabase | **Chỉ dùng Postgres.** Không dùng Supabase Auth, Storage hay client JS. |

## 3. Kiến trúc

```
 Trình duyệt ──► app (Next.js) ──┐
                                 ├──► Supabase Cloud: chỉ Postgres
 worker (Node) ──────────────────┘      • bảng nghiệp vụ
      │                                 • hàng đợi pgmq
      │                                 • trạng thái LangGraph (PostgresSaver)
      ├──► 9router (LLM văn bản + sinh ảnh)
      ├──► YouTube Data API
      └──► ./data/ (dùng chung với app qua volume Docker)
```

- **Một repo, hai tiến trình.** App Next.js giữ nguyên ở thư mục gốc. Worker là entry riêng (dự kiến `src/worker/`). Component Remotion nằm ở `src/remotion/`, dùng chung cho app (xem trước bằng `@remotion/player`) và worker (render bằng `@remotion/renderer`), nên bản xem trước và file render luôn giống nhau.
- **Truy cập dữ liệu chỉ ở phía server.** App (server component, server action, route handler) và worker kết nối thẳng Postgres bằng chuỗi kết nối. Trình duyệt không gọi DB.
- **Duyệt giữa các bước là trạng thái trong DB**, không phải `interrupt()` của LangGraph. Duyệt xong thì app đẩy job của bước kế tiếp vào hàng đợi.
- **LangGraph chỉ dùng bên trong một bước** cho vòng viết–validate–sửa (bước 3; sau này có thể cả bước 2).
- **Hàng đợi:** extension `pgmq` của Postgres (nền tảng của Supabase Queues), gọi bằng SQL.
- **Lớp storage:** mọi đọc ghi file đi qua một module nhỏ, để sau này chuyển sang object storage chỉ cần đổi một chỗ.
- **Docker Compose có 3 service:**
  - `migrate`: chạy migration rồi thoát; `app` và `worker` chỉ khởi động sau khi nó thành công.
  - `app`: Next.js (image Alpine), chỉ mở cổng trên `127.0.0.1:3000` vì không có đăng nhập.
  - `worker`: image `node:22-bookworm-slim`, chạy TypeScript bằng `tsx`; thư viện cho Chrome Headless Shell thêm ở M6. Tài liệu Remotion khuyên không dùng Alpine.
  - `app` và `worker` mount `./data` và `./certs`.
- **Thay đổi so với repo hiện tại:** bỏ `@supabase/ssr`, `@supabase/supabase-js`, `src/lib/supabase/*`, và hai biến `NEXT_PUBLIC_SUPABASE_*`. Trang trạng thái sẽ đổi sang kiểm tra kết nối Postgres.

## 4. Mô hình dữ liệu

Trạng thái dùng chung cho đối tượng cần duyệt: `draft → generating → pending_review → approved | rejected`, cộng `failed`.

| Bảng | Cột chính |
|---|---|
| `channels` | `name`, `youtube_channel_id`. Thông tin đăng nhập ở env, không lưu DB. |
| `assets` | `name` (duy nhất, theo chuẩn đặt tên), `kind` (`chr`/`bg`/`prop`/`fx`), `display_name`, `description`, `aliases[]`, `status` |
| `asset_variants` | `asset_id`, `state` (theo danh sách cho phép; `base` = ảnh gốc), `file_path`, `width`, `height`, `prompt`, `status`. Duy nhất theo (`asset_id`, `state`). |
| `videos` | `channel_id` (cho phép NULL; bắt buộc khi upload), `title`, `brief`, `combo_id` (nullable), `status` (`scripting/storyboarding/rendering/uploading/done`) |
| `scripts` | `video_id`, `version`, `content` (JSON), `model`, `status` |
| `scenes` | `video_id`, `script_id`, `position` (thứ tự cảnh; `order` là từ khóa SQL), `dsl` (JSON), `dsl_version`, `duration_frames`, `status` |
| `validations` | `target_type`, `target_id`, `validator_model`, `rubric_version`, `scores` (JSON), `verdict`, `feedback` |
| `reviews` | `target_type`, `target_id`, `decision`, `reason`, `created_at` |
| `renders` | `video_id`, `file_path`, `duration_ms`, `status`, `error` |
| `uploads` | `video_id`, `channel_id`, `youtube_video_id`, `privacy_status`, `made_for_kids` (mặc định `false`), `attempts`, `status` (dùng enum `job_status`), `error` |
| `job_runs` | `job_type`, `target_type`/`target_id` (cho phép NULL với job hệ thống), `status`, `attempts`, `error`, `metrics` (JSON: model đã gọi, số token), `queue_msg_id`, `created_at`, `started_at`, `finished_at` |
| `combos` | Bảng có ngay (để `videos.combo_id` tham chiếu), nạp sẵn **một** combo cố định cho lát cắt đầu. Chi tiết cột chốt ở spec combo và ACE. |

- `validations` và `reviews` tham chiếu đa hình bằng (`target_type`, `target_id`), **không có khóa ngoại thật**. Đổi lại có một chỗ duy nhất để ACE đọc toàn bộ lịch sử chấm và duyệt.
- **Bảng do hệ thống tạo:** hàng đợi `pgmq`; bảng checkpoint của `PostgresSaver`.
- **Bảng để dành** (thêm sau, không sửa bảng cũ): `asset_rig_parts`, `playbook_entries`.
- **Mọi thay đổi schema** đi qua file migration trong repo. Công cụ cụ thể (đề xuất Drizzle) xác minh ở plan M1.

## 5. Luồng 7 bước (lát cắt đầu)

Mẫu chung: người dùng bấm → app đẩy job → worker xử lý → kết quả `pending_review` → duyệt sang bước sau. Bị loại thì ghi lý do vào `reviews`; lý do đó đi kèm khi sinh lại.

1. **Assets.** Người dùng nhập loại và mô tả ngắn. LLM viết mô tả chi tiết, đề xuất tên đúng chuẩn và viết prompt ảnh. 9router sinh ảnh `base`. Duyệt thì lưu tên, mô tả, `width`/`height`. Sau đó sinh biến thể trạng thái, mỗi biến thể duyệt riêng.
   - **Xử lý ảnh (kết luận M0):** với `chr`, `prop`, `fx` luôn yêu cầu nền `#00FF00` phẳng, không bao giờ yêu cầu nền trong suốt (model vẽ ô caro giả). Worker tách nền theo ngưỡng màu, khử ám xanh ở viền, **cắt sát** vùng có nội dung, lưu PNG có alpha; `width`/`height` là kích thước **sau khi cắt**. `bg` không tách nền.
   - Định dạng ảnh đọc từ nội dung file (`sniffImage`), không tin `Content-Type` của router.
   - **Nhất quán biến thể:** model hiện tại (`textToImage`) không đảm bảo giữ nhân vật giữa các biến thể; nhất quán dựa vào mô tả chi tiết cố định và người duyệt loại ảnh lệch. Hướng cải thiện (quyết định sau): thêm nhà cung cấp có chế độ sửa theo ảnh vào 9router, hoặc làm sớm rig.
2. **Kịch bản.** Đầu vào: brief và danh sách asset đã duyệt (tên, mô tả). LLM trả JSON gồm các nhịp, câu thoại gắn `@chr_...`, ghi chú hành động, đánh dấu miếng hài. Dùng khung truyện của combo cố định. Qua validate lớp 1 rồi chờ duyệt.
3. **Phân cảnh (LangGraph).** Các node: `chia_cảnh → viết_JSON_cảnh → kiểm_tra_máy → giám_khảo`. Đạt thì xong; chưa đạt thì sửa theo nhận xét, tối đa **2 vòng**, quá thì chuyển `failed` để người xử lý. Trạng thái lưu bằng `PostgresSaver`. Kết quả chờ duyệt.
4. **Sinh cảnh.** Không có job riêng. JSON cảnh được component Remotion dựng hình; xem trước trên trình duyệt bằng Remotion Player.
5. **Âm thanh.** Ẩn. Thoại hiển thị dạng phụ đề hoặc bóng thoại. Sau này: TTS qua 9router (router hỗ trợ loại `tts`) hoặc ElevenLabs.
6. **Ghép video.** Duyệt đủ các cảnh thì worker render **một** composition Remotion xếp nối các cảnh, ra `data/renders/<video-id>.mp4`. Người dùng xem MP4 và duyệt.
7. **Upload.** Người dùng nhập tiêu đề, mô tả, tag (LLM có thể gợi ý). Worker gọi `videos.insert` với `made_for_kids = false` và **mặc định `private`**. Thông tin kênh tạm để trong env (OAuth client và refresh token cho mỗi kênh, lấy một lần bằng script tay). **Lưu ý (M0):** project OAuth ở trạng thái Testing nhận refresh token hết hạn sau 7 ngày; M7 phải chọn đăng nhập lại mỗi tuần hoặc đưa app OAuth sang Production (tra yêu cầu xác minh của Google cho `youtube.upload` ở plan M7).

### Khuôn JSON cảnh

Mỗi cảnh mô tả: bối cảnh (`@bg_...`), nhân vật (vị trí, kích thước, đổi trạng thái theo thời điểm), câu thoại (người nói, nội dung, thời điểm bắt đầu và kết thúc), chuyển động camera (zoom, lia), chuyển cảnh, và tổng thời lượng. Khuôn có số phiên bản (`dsl_version`).

**Schema chi tiết của khuôn là hợp đồng dữ liệu, sẽ được trình bày trong plan M3 và cần user duyệt riêng** (luật 3 trong `AGENTS.md`).

## 6. Validate và tiêu chuẩn

### Lớp 1: kiểm tra máy móc (không dùng LLM, luôn chạy trước)
- JSON đúng khuôn.
- Tham chiếu `@...` hợp lệ theo chuẩn đặt tên.
- Tổng thời lượng khớp mục tiêu.
- Thoại không vượt tốc độ đọc phụ đề. Ngưỡng lấy từ một hướng dẫn phụ đề đã công bố, xác minh ở plan M4.

Sai ở lớp này thì sinh lại luôn, không gọi giám khảo.

### Lớp 2: giám khảo LLM
- **Phương pháp:** G-Eval. Mỗi tiêu chí có định nghĩa, giám khảo suy luận từng bước, rồi điền điểm 1–5 vào form JSON.
- **Chống thiên vị:** giám khảo là model **khác họ** với model viết, để giảm thiên vị tự ưu ái đầu ra của mình (Zheng et al.). Mỗi lần chấm lưu `rubric_version`.

| Tiêu chí | Căn cứ | Loại |
|---|---|---|
| Phù hợp lứa tuổi, tối đa TV-14 | TV Parental Guidelines (nhãn D, L, S, V) | Chặn cứng |
| An toàn để kiếm tiền | YouTube Advertiser-friendly content guidelines, mức "đầy đủ quảng cáo" | Chặn cứng |
| Miếng hài | Benign violation theory (McGraw & Warren 2010) | Điểm, chấm từng miếng |
| Mạch truyện, setup và payoff | Tiêu chí nội bộ, hiệu chỉnh theo lịch sử duyệt | Điểm |
| Bám kịch bản (chỉ cho cảnh) | So với kịch bản đã duyệt | Điểm |

- **Điều kiện đạt:** không vi phạm tiêu chí chặn cứng, và điểm trung bình ≥ **3.5/5**. Ngưỡng là giá trị khởi điểm, đặt trong cấu hình.
- **Hiệu chỉnh:** hệ thống ghi tỉ lệ đồng thuận giữa giám khảo và quyết định duyệt của người. Lệch nhiều thì sửa bộ tiêu chí qua spec mới.
- **Lưu ý:** không có tiêu chuẩn quốc tế cho "kịch bản hay". Chỉ hai tiêu chí chặn cứng dựa trên tiêu chuẩn công khai.

## 7. Combo và ACE (thiết kế hình dạng, làm sau lát cắt đầu)

**Combo** gồm khung truyện (các nhịp), kiểu hook 5–15 giây đầu, kỹ thuật thả miếng, nhịp độ và giọng điệu. Mỗi video lưu combo đã dùng. Lát cắt đầu có một combo cố định; sau này tự chọn dựa trên kết quả các video trước.

**ACE** (Agentic Context Engineering): sổ tay chiến lược `playbook_entries`, với ba vai trò:
- **Người viết:** dùng các mục liên quan trong sổ tay khi viết.
- **Người phản tư:** phân tích nhận xét của giám khảo và lý do duyệt của người (sau này thêm số liệu xem YouTube).
- **Người biên tập:** chỉ áp dụng **thay đổi nhỏ** (thêm mục, tăng bộ đếm hữu ích hoặc có hại), không viết lại toàn bộ sổ tay.

Giai đoạn đầu, **mục mới phải chờ người duyệt**; chỉ việc tăng bộ đếm là tự động. Vì vậy lát cắt đầu phải lưu đầy đủ `validations` và `reviews`.

## 8. Xử lý lỗi và theo dõi

- **Thử lại job:** job lỗi tự hiện lại nhờ thời gian ẩn của `pgmq`. Sau **3 lần** thì `failed`, giao diện có nút "Thử lại".
- **Chạy lại an toàn:** file ghi ra chỗ tạm rồi đổi tên; mỗi job gắn với một đối tượng và phiên bản.
- **9router:** lỗi, timeout hoặc giới hạn tốc độ thì thử lại với thời gian chờ tăng dần. JSON sai khuôn tính là trượt lớp 1.
- **YouTube:**
  - Hết quota `videos.insert` (100 lần/ngày/project): hẹn job sang ngày hôm sau.
  - `uploadLimitExceeded` hoặc refresh token hỏng: `failed` kèm hướng dẫn.
- **LangGraph:** worker chết thì chạy tiếp từ checkpoint gần nhất.
- **Theo dõi:** log có cấu trúc ra stdout; `job_runs` cho giao diện; `job_runs.metrics` ghi model và số token.
- **Dọn dữ liệu:** chưa tự dọn `./data` ở lát cắt đầu.

## 9. Biến môi trường dự kiến

Tên cuối cùng chốt trong plan từng mốc.

| Biến | Dùng ở | Ghi chú |
|---|---|---|
| `DATABASE_URL`, `DATABASE_CA_CERT` | app, worker | Chuỗi Session pooler của Supabase (bí mật, chỉ server); CA cert của Supabase, đường dẫn vd. `certs/supabase-ca.crt` (bắt buộc: kho CA hệ thống không xác minh được) |
| `NINE_ROUTER_BASE_URL`, `NINE_ROUTER_API_KEY` | worker (và app nếu cần) | Đã có |
| `LLM_WRITER_MODEL`, `LLM_JUDGE_MODEL`, `IMAGE_MODEL` | worker | Giám khảo phải khác họ với model viết |
| `DATA_DIR` | app, worker | Mặc định `./data`; `/app/data` trong container |
| `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`, refresh token theo kênh | worker | Dạng lưu refresh token theo kênh chốt ở plan M7 |

## 10. Kiểm thử

Theo luật 4–6 trong `AGENTS.md`:
- Spec này **không** gồm test tự động; agent không tự viết hay chạy file test.
- Xác minh bằng lint, `tsc`, build, và người vận hành chạy thử hết đường đi.
- Muốn có test thì yêu cầu riêng, lập plan kịch bản test và duyệt trước.

## 11. Thứ tự làm

| Mốc | Nội dung |
|---|---|
| M0 | **Kiểm chứng.** (a) Sinh ảnh qua 9router: có giữ nhân vật với ảnh tham chiếu không; có nền trong suốt hoặc tách nền được không. (b) Bật `pgmq` trên Supabase, chọn chuỗi kết nối. (c) Render Remotion trong Docker trên máy người vận hành, đo thời gian. (d) Lấy refresh token YouTube, upload thử 1 video riêng tư. Mỗi phép thử cần user đồng ý vì tốn credit hoặc đụng tài khoản thật. |
| M1 | **Nền móng:** schema và migration, kết nối Postgres, lớp storage, worker + hàng đợi + `job_runs`, compose 2 service, client 9router |
| M2 | Flow 1: Assets |
| M3 | Khuôn JSON cảnh + component Remotion + Player (cũng là flow 4) |
| M4 | Flow 2: Kịch bản |
| M5 | Flow 3: Phân cảnh (LangGraph + validate) |
| M6 | Flow 6: Render video hoàn chỉnh |
| M7 | Flow 7: Upload YouTube → **xong lát cắt đầu** |

**Sau lát cắt đầu (mỗi mục một spec):** combo và ACE → âm thanh → rig → mở rộng quy mô (nhiều worker, render trên cloud, OAuth nhiều kênh, dọn `./data`) → học từ số liệu xem YouTube.

Kết quả M0 có thể làm đổi thiết kế; khi đó cập nhật spec này trước khi làm tiếp.

## 12. Mục cần xác minh với nguồn chính thức (luật 1)

| Mục | Xác minh ở |
|---|---|
| Model `ag/gemini-3.1-flash-image` có nhận ảnh tham chiếu và cho nền trong suốt không | M0 |
| Supabase có cho bật `pgmq`; loại chuỗi kết nối phù hợp cho `pgmq` và `PostgresSaver` | M0 / M1 |
| Công cụ ORM và migration | Đã xác minh: Drizzle 0.45.4 + drizzle-kit 0.31.11 (M1) |
| Ngưỡng tốc độ đọc phụ đề | **Đã xác minh (M4):** Netflix English Timed Text Style Guide: 20 ký tự/giây (người lớn), 42 ký tự/dòng, 2 dòng, 5/6–7 giây; dùng mức người lớn cho khán giả 14–18 |
| Nguyên văn định nghĩa TV Parental Guidelines từ trang chính thức (hiện mới có nguồn thứ cấp) | **Đã xác minh (M5)** qua bản FCC Public Notice FCC 97-321 (tvguidelines.org trả 404); nguyên văn TV-14 và D/L/S/V nằm trong `src/lib/judge/rubric.ts` |
| `videos.insert` bắt buộc OAuth; kiểm tra lại nguyên văn quota (đã đọc qua công cụ tóm tắt) | **Đã đọc nguyên văn (M7):** 100 lượt `videos.insert`/ngày/project, upload từ project chưa xác minh không bị ép riêng tư, `privacyStatus` bỏ trống thì mặc định public. **Còn mở:** múi giờ reset hạn mức; độ nhạy scope `youtube.upload`; tin đồn 1600 đơn vị/lần (nguồn bên thứ ba) chưa kiểm chứng; upload thật chưa chạy (chờ credential) |
| Cách ACE lọc trùng mục (embedding?); API số liệu xem YouTube | Spec ACE |
| Remotion và Next.js dùng chung phiên bản React 19 | **Đã xác minh (M3):** Player chạy dưới Next 15.5 + Turbopack (dev và build) |

## 13. Rủi ro và lưu ý

- **License Remotion:** miễn phí khi tối đa 3 người vận hành. Từ 4 người phải mua Company License (gói cho tool tự động: $0.01/lần render, tối thiểu $100/tháng).
- **Quota YouTube** 100 upload/ngày/project chạm đúng mốc 100 video/ngày, nên khi mở rộng cần nhiều project hoặc kênh.
- **Nhất quán biến thể asset:** model ảnh hiện tại không giữ chi tiết nhân vật giữa các lần sinh (M0); xem §5 bước 1.
- **Render (số đo M0):** 90 s video 1080p render trong 25.1 s trên Docker VM 20 CPU; ước lượng 100 video × 5 phút ≈ 2.3 giờ tuần tự. Render cục bộ đủ cho giai đoạn đầu; chỉ xét render trên cloud khi số đo thực tế với cảnh nhiều lớp vượt khả năng máy.
- **Router của người vận hành hiện chưa có tính năng sinh video.** Không ảnh hưởng, vì đã chọn chỉ dùng Remotion.
- **Không có đăng nhập:** app chỉ mở trên `127.0.0.1`. Không đưa lên mạng công khai khi chưa thêm đăng nhập.

## 14. Nguồn đã dùng

- 9router: [skill sinh ảnh](https://github.com/decolua/9router/blob/master/skills/9router-image/SKILL.md), [skill sinh video](https://github.com/decolua/9router/blob/master/skills/9router-video/SKILL.md); `GET /v1/models/image` trên router của người vận hành trả về `ag/gemini-3.1-flash-image` (kiểm tra ngày 2026-10-20).
- ACE: [arXiv 2510.04618](https://arxiv.org/abs/2510.04618v2)
- LangGraph.js: [interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts), [Postgres checkpointer](https://docs.langchain.com/oss/javascript/langgraph/add-memory)
- [Supabase Queues](https://supabase.com/docs/guides/queues)
- Remotion: [renderMedia](https://www.remotion.dev/docs/renderer/render-media), [Player](https://www.remotion.dev/docs/player/integration), [Docker](https://www.remotion.dev/docs/docker), [License FAQ](https://www.remotion.dev/docs/license/faq), [Company Licensing](https://www.remotion.pro/license)
- YouTube: [Made for kids](https://support.google.com/youtube/answer/9528076?hl=en), [Advertiser-friendly guidelines](https://support.google.com/youtube/answer/6162278?hl=en), [quota](https://developers.google.com/youtube/v3/determine_quota_cost), [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [G-Eval (arXiv 2303.16634)](https://arxiv.org/abs/2303.16634v3); [Judging LLM-as-a-Judge (arXiv 2306.05685)](https://arxiv.org/pdf/2306.05685); [McGraw & Warren 2010](https://leeds-faculty.colorado.edu/mcgrawp/pdf/mcgraw.warren.2010.pdf)
- TV Parental Guidelines (nguồn thứ cấp): [MovieLabs](https://movielabs.com/md/ratings/v2.4.4/html/US_TVPG_Ratings.html), [EBSCO](https://ebsco.com/research-starters/communication-and-mass-media/tv-parental-guidelines-system)
