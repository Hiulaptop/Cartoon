# Automation — video giải thích công nghệ và hệ thống đời thường

Ngày: 2026-10-29

Trạng thái: **User đã duyệt spec bằng văn bản ngày 2026-10-29** qua tin nhắn “duyệt”. Được chuyển sang viết kế hoạch triển khai; chưa duyệt kế hoạch hoặc phương thức thực thi. Phê duyệt spec không cho phép tự triển khai code, áp dụng migration hay gọi dịch vụ có phí.

## 1. Mục tiêu và những quyết định đã thống nhất

Xây khu vực **Automation** độc lập trong app hiện tại để một người có khoảng **5 giờ/tuần** vận hành dây chuyền sản xuất video; chỉ mở rộng lên toàn thời gian khi có dữ liệu chứng minh hiệu quả.

- Khán giả: người trưởng thành tò mò, không cần nền tảng chuyên môn.
- Chủ đề đầu tiên: công nghệ và hệ thống đời thường; ví dụ Wi-Fi, luồng giao nhận, hàng đợi, truyền thông tin.
- Định dạng chính: explainer ngang 4–6 phút, motion graphics phục vụ lập luận, không phải slideshow trang trí.
- Mỗi video giải thích một câu hỏi và một ý tưởng trung tâm; có phạm vi, ví dụ và giới hạn kết luận.
- Một hồ sơ kênh; người dùng nhập câu hỏi thủ công.
- Ba cổng người duyệt: nghiên cứu → kịch bản/storyboard → bản cuối.
- Đầu ra MVP: gói hoàn chỉnh để tải và đăng thủ công; **không gọi API upload YouTube**.
- Không phát triển tiếp Cartoon/Bài giảng trong scope này; không xóa hay chuyển đổi dữ liệu cũ.

Thành công sản phẩm: có thể đi từ câu hỏi đến gói video có bằng chứng, xem lại và sửa được, không vượt cổng duyệt. Một lần render thành công không chứng minh nội dung đúng, có người muốn xem hoặc có lợi nhuận.

## 2. Phạm vi và lựa chọn kiến trúc

Chọn **workflow điều phối bằng code với các artifact có phiên bản**, không chọn agent tự do chạy đến lúc tự công khai. Không chỉ thêm một vỏ UI vào algorithm workflow cũ.

MVP gồm: thiết lập hồ sơ, tạo video, nghiên cứu nguồn, danh sách khẳng định/bằng chứng, ba màn hình duyệt, bộ đồ họa giới hạn, preview ngắn cảnh khó, TTS, render, chỉnh sửa theo cảnh, metadata/thumbnail và xuất gói.

Ngoài MVP:

- Hướng dẫn phần mềm, quay thao tác trình duyệt/desktop; giải thích ngành chuyên sâu.
- Nhiều kênh, tự săn trend, tự tạo video hàng loạt, upload/lên lịch YouTube, tự nhập analytics.
- Người dẫn ảo, nhân vật truyện, sinh video AI, tự viết và chạy mã dựng cảnh tùy ý.
- Video dọc, đa ngôn ngữ, editor timeline kéo thả, bình luận gắn timestamp chi tiết.
- Nguồn cần đăng nhập, trả phí, PDF/scan hoặc JavaScript mới xem được; browser automation để vượt giới hạn nguồn.
- Âm nhạc/footage bên ngoài trong bản đầu: mặc định chỉ có lời đọc và đồ họa tạo nội bộ. Không phát triển hệ thống cấp phép thư viện media.
- Cơ chế đăng nhập toàn app hoặc refactor các workflow cũ.

## 3. Hiện trạng đã kiểm tra và ranh giới tái sử dụng

Đã đọc có mục tiêu các điểm tích hợp ngày 2026-10-29; không coi đây là khảo sát toàn bộ repo.

- `package.json`: Next.js 15.5.28, React 19.1.0; Remotion và các gói renderer/bundler/player ghim 4.0.537. `package-lock.json` ghi drizzle-orm 0.45.4.
- `Dockerfile`: app dùng node:22-alpine; worker dùng node:22-bookworm-slim và có browser phục vụ render.
- `src/components/app-sidebar.tsx`: điều hướng hiện được lọc theo mode; có thể thêm mục độc lập xuất hiện ở cả hai mode, không sửa enum mode để nhét Automation vào.
- `src/lib/db/schema.ts`: `video_kind` chỉ có cartoon/algorithm. Automation dùng thực thể riêng, không ép vào `videos` và không thêm kind mới.
- `src/worker/runner.ts`: chạy một job mỗi lần, retry tối đa ba lần; render có thể giữ worker lâu. Không hứa throughput song song.
- `src/lib/ninerouter/client.ts`: client chat trả nội dung/model/token usage; không có khả năng web search/fetch được chứng minh từ client này.
- `src/worker/llm-structured.ts`: có kiểm JSON và vòng sửa tối đa hai lần, là pattern tái sử dụng có điều kiện; không tự coi đó là fact-check hoặc bộ quản lý ngân sách.
- `src/lib/ninerouter/tts.ts`: đã có discovery model/voice và tạo audio qua router; timeout có thể để lại kết quả upstream chưa rõ. Không tự retry mọi TTS request.
- Animation algorithm cũ cố định dọc, tối đa 180 giây và thao tác mảng/con trỏ; **không phù hợp làm hợp đồng mới**.

Dùng chung nếu phù hợp: DB client, storage an toàn, queue/lock, client LLM, adapter TTS, thông báo UI và nền tảng render. Viết mới domain Automation, schema artifact, nguồn/bằng chứng, layout motion graphics và composition riêng. Không import DB/fs/pg vào bundle đồ họa; bundler/renderer chỉ thuộc worker như repo hiện tại.

Công cụ context7 không có trong catalog phiên này; đã tìm nhưng không có kết quả. Skill understand-anything cũng không có trong danh sách khả dụng. Chưa dựng knowledge graph; trước khám phá rộng hoặc triển khai cần khôi phục công cụ bắt buộc hoặc xin user cho phép phương án thay thế. Tài liệu chính thức tham khảo ở §16; không chốt API mới từ trí nhớ.

## 4. Các trang và điều hướng

Route dự kiến:

- `/automation`: bảng điều hành, thứ tự “Cần bạn quyết định”, “Đang sản xuất”, “Bản nháp và hoàn thành”.
- `/automation/new`: tạo câu hỏi, trường nâng cao thu gọn, tóm tắt giới hạn chi phí.
- `/automation/settings`: một hồ sơ kênh và kết nối dịch vụ/phạm vi nguồn.
- `/automation/[id]`: không gian video, các mục Brief, Nghiên cứu, Kịch bản & storyboard, Bản cuối, Lịch sử. Mở mặc định ở quyết định đang chờ.

Đổi cookie Cartoon/Bài giảng không lọc hoặc thay đổi Automation. Sidebar đánh dấu đúng mục; topbar ghi khu vực Automation và nói rõ công tắc cũ chỉ áp dụng khu vực cũ, không khiến người dùng tưởng nó đổi video Automation. Không đặt design/series/project làm điều kiện tạo video.

UI hiển thị lý do bị chặn, phiên bản, nguồn, vấn đề còn mở và nút hành động có ngữ nghĩa cụ thể. Không có “duyệt tất cả”. Job đang chạy không yêu cầu người dùng mở từng log; lỗi có đường dẫn tới phần cần xử lý.

## 5. Đầu vào và hồ sơ kênh

Một hồ sơ cấu hình độc lập, không đồng nhất với OAuth YouTube hoặc bảng channels cũ.

- Ngôn ngữ mặc định đề xuất: tiếng Việt; có thể sửa trước khi dùng, không sinh nhiều ngôn ngữ trong cùng video.
- Đối tượng, giọng văn, cách xưng hô, chủ đề tránh, phong cách đồ họa.
- Mục tiêu 4–6 phút; đầu ra mặc định đề xuất 1920×1080, 30 fps, MP4 H.264.
- Chọn rõ model/voice từ dịch vụ thực tế; không đoán một giọng mặc định hoặc tự chuyển model khi lỗi.
- Danh sách miền nguồn được duyệt, giới hạn giá và chi phí; không lưu API key trong artifact, trình duyệt hoặc export.
- Chưa có thông tin tối thiểu thì cho lưu draft, không bắt đầu gọi dịch vụ.

Mỗi video bắt buộc câu hỏi không rỗng; tùy chọn góc nhìn, điều tránh và URL nguồn. Không nhận file/source text riêng tư trong MVP. Snapshot hồ sơ và policy khi bắt đầu để sửa settings không âm thầm đổi một video đang sản xuất.

Trước khi bắt đầu, brief phải đủ hẹp để trả lời trong một tập. Chủ đề sức khỏe, đầu tư, pháp lý hoặc khẳng định về nội bộ tổ chức chưa có bằng chứng bị yêu cầu thu hẹp hoặc từ chối, không tự làm như chuyên gia.

## 6. Pipeline và ba cổng duyệt

### 6.1 Nghiên cứu

1. Chuẩn hóa brief; nhận URL người dùng và/hoặc URL ứng viên do LLM đề xuất.
2. URL ứng viên chỉ là gợi ý, không phải kết quả tìm kiếm hoặc trích dẫn đã kiểm chứng.
3. Fetch và trích xuất nội dung bằng adapter đọc nguồn an toàn (§7).
4. Lập `research` revision: câu trả lời chính, phạm vi, claim list, evidence links, mâu thuẫn/thiếu bằng chứng và hướng hình ảnh.
5. Chặn nếu khẳng định trung tâm không được hỗ trợ; cho người dùng bổ sung URL, đổi góc hoặc bỏ chủ đề.

**Cổng 1:** duyệt đúng research revision và brief snapshot. Người dùng xem claim cạnh trích đoạn nguồn và giới hạn kết luận; liên kết sống không thay thế trích đoạn đã lưu. Duyệt không cho phép bỏ qua cổng 2 hoặc render cuối.

### 6.2 Kịch bản và storyboard

Tạo `storyboard` revision từ research đã duyệt: lời dẫn theo cue, cảnh có ID ổn định, quan hệ claim/source, đối tượng/chuyển động và nhãn giả định. Nội dung không thêm khẳng định mới chưa có evidence; cần thêm thì quay lại nghiên cứu.

Cấu trúc kể linh hoạt: câu hỏi/hook → dự đoán → mô hình → diễn biến → ngoại lệ → kết luận. Không ép cùng số cảnh hoặc cùng cốt truyện.

Tạo một clip 15–30 giây của cảnh khó nhất bằng renderer thật, không phải ảnh minh họa giả. Người dùng có thể đổi cảnh mẫu; audio dùng lại nếu còn khớp. Preview phát sinh chi phí và được tính vào ngân sách. Preview lỗi hoặc chứa thao tác không hỗ trợ thì chưa được duyệt để sản xuất.

**Cổng 2:** duyệt kịch bản, storyboard và preview cùng revision. Có thể đọc/góp ý theo cảnh; không yêu cầu timeline editor. Khi duyệt mới cho chạy production từ đúng input snapshot.

### 6.3 Production và bản cuối

Sinh audio theo cue, xác định thời lượng thật, dựng timeline, render, kiểm kỹ thuật, tạo thumbnail/metadata nháp. Không đổi lời đã duyệt để khớp thời gian; nếu audio làm tập vượt 4–6 phút phải yêu cầu sửa kịch bản hoặc cho người dùng phê duyệt ngoại lệ thời lượng với lý do, không tăng tốc ép buộc.

**Cổng 3:** người dùng xem toàn bộ video, thumbnail và metadata; xử lý mọi blocker. Quyết định gắn với video checksum, storyboard revision và gói metadata/thumbnail tương ứng. Hệ thống không tuyên bố xác nhận được việc người dùng đã xem hết chỉ từ nút bấm.

Duyệt tạo quyền export gói của bản đó, không quyền công khai. Không có API upload được gọi.

## 7. Nguồn, bằng chứng và giới hạn nghiên cứu tự động

MVP không thêm nhà cung cấp search trả phí hoặc giả định model biết web hiện tại. Hỗ trợ fetch HTML/text công khai từ miền được duyệt. URL do LLM nhớ có thể sai; phải fetch thành công và kiểm nguồn trước khi dùng.

- Mỗi source lưu URL yêu cầu/final nếu có, tiêu đề, ngày đọc, ngày công bố nếu tìm thấy, hash và nội dung trích xuất phục vụ review.
- Mỗi evidence lưu source ID, vị trí/trích đoạn nguyên văn và hash snapshot. Kiểm quote khớp nội dung; liên quan về ngữ nghĩa vẫn cần người duyệt.
- Claim phân biệt dữ kiện, suy luận và giả định; số liệu kèm đơn vị, thời điểm và phạm vi. Mô phỏng giả định ghi rõ giả định, không tạo citation giả.
- Các nguồn cùng sao chép một bài không được mô tả là xác nhận độc lập. Không đặt số nguồn tối thiểu thay thế chất lượng.
- Sửa URL, trích đoạn hoặc claim tạo revision nghiên cứu mới; không mutate nội dung đã duyệt.
- Nếu không đọc được nguồn: trạng thái rõ, cho bổ sung nguồn khác; không dùng snippet tưởng tượng hoặc nội dung model nhớ làm bằng chứng.
- Nguồn là dữ liệu không tin cậy: chỉ thị nằm trong trang không được phép thay brief, gọi công cụ, đọc bí mật, đổi ngân sách hoặc tự duyệt.

An toàn fetch: allowlist hostname có duyệt; HTTPS, port 443; không credentials trong URL; không theo redirect tự động. Kiểm DNS A/AAAA và địa chỉ thực kết nối, chặn loopback/private/link-local/metadata và đích nội bộ trên mọi lần kết nối; chống DNS rebinding. Redirect sang URL khác phải kiểm tra lại đầy đủ, không hạ HTTPS. Timeout/kích thước/content-type có giới hạn; đề xuất ban đầu 15 giây, 2 MiB/source, tối đa 6 nguồn/video; báo rõ nội dung bị từ chối/cắt giới hạn, không giả vờ đã đọc toàn bộ. Không chạy JS hoặc tải subresource của nguồn, không gửi credential app/router ra ngoài. HTML được loại bỏ markup nguy hiểm trước khi hiển thị.

Không export toàn văn nguồn của bên thứ ba. Gói chỉ ghi link/attribution và các trích đoạn ngắn cần thiết khi có cơ sở sử dụng; bằng chứng đọc nội bộ không đồng nghĩa được cấp quyền tái bản.

## 8. Hợp đồng đồ họa và âm thanh mới

`AutomationStoryboardV1` là dữ liệu khai báo, version 1, không chứa JSX/JS/HTML tùy ý hoặc URL media tự do.

Nội dung tối thiểu: format; scenes có stable ID; cues có stable ID, text hiển thị và spoken text; claim references; assumption labels; objects có ID/type/label; operations có target và quan hệ thứ tự hoặc cue-relative timing. Các khác biệt chỉ phục vụ phát âm không được đổi nghĩa của spoken text.

Bộ dựng MVP:

- Đối tượng từ thư viện nội bộ: người/thiết bị/router/server/kiện hàng/quầy bằng biểu tượng trung tính có giấy phép phù hợp.
- Node + connector có hướng, nhãn và luồng di chuyển.
- Hàng đợi hữu hạn, trạng thái chờ/xử lý/xong.
- Bố cục so sánh hai phương án; callout, bộ đếm và số có đơn vị.
- Highlight, show/hide, move theo vị trí/đường đã định nghĩa.

Không có vật lý tổng quát, đồ họa 3D, arbitrary SVG path/code hoặc chart tự do trong bản đầu. Layout là preset có giới hạn đối tượng/chữ; scene planner kiểm khả năng thể hiện trước khi sản xuất. Không bịa hình ảnh vượt allowlist.

Kiểm máy: đối tượng/đích thao tác tồn tại, không ID trùng, thứ tự hợp lệ, số hữu hạn, thời gian nằm trong cue/cảnh, không thao tác ngoài allowlist, caption không thiếu cue, chữ không vượt vùng an toàn theo font/layout thực. Đây là kiểm cấu trúc/khả năng hiển thị, không khẳng định kiến thức đúng.

Các mô hình minh họa hàng đợi/luồng dùng trạng thái khai báo và phép tính có kiểm tra; không để LLM tự cung cấp số liệu tính toán mà không đối chiếu. Muốn mô phỏng chuyên sâu cần mở rộng được duyệt riêng.

Composition và Player dùng cùng artifact render input. Audio duration thật quyết định timeline; caption ở cấp cue, chưa hứa word-level alignment. Thumbnail dựng từ preset/đồ họa nội bộ, có thể chọn trong tối đa ba phương án. Không bắt buộc AI image API để hoàn thành MVP.

## 9. Dữ liệu và state machine đề xuất

Đây là đề xuất schema để user duyệt, **không phải migration đã thực hiện**. Dùng namespace `automation_`; không thay hợp đồng cũ hoặc RLS toàn app.

Các thực thể:

1. `automation_profiles`: singleton config có version; không chứa secret.
2. `automation_videos`: câu hỏi/brief snapshot, stage, trạng thái hoạt động, con trỏ revision/output đang chọn, archive flag.
3. `automation_revisions`: immutable content JSONB có discriminator/version, kind `research` hoặc `storyboard`, parent/dependency revision IDs, input fingerprint, trạng thái active/stale. Sửa tạo hàng mới.
4. `automation_sources`: snapshot nguồn theo video, metadata/hash, đường dẫn nội dung lưu trên DATA_DIR; research evidence tham chiếu ID này.
5. `automation_runs`: job liên kết, video/stage/revision, input snapshot, request fingerprint, usage/cost/reservation, lỗi, output ID; ràng buộc ngăn active run trùng cùng đầu vào.
6. `automation_reviews`: quyết định/cổng, subject revision hoặc output, subject hash, nhận xét/thời điểm. Quyết định cũ không xóa; hiệu lực được suy từ dependencies.
7. `automation_outputs`: loại preview/audio/render/package; manifest, hashes, duration, file paths, dependencies, trạng thái ready/stale/failed. Audio cache theo fingerprint.

Dùng job_runs/queue chung cho vận chuyển; đề xuất thêm target type Automation cần thiết trong migration độc lập được duyệt, không nhét ID vào loại target cũ. Ledger chi phí có định danh thao tác ổn định, kể cả lần retry; không ghi đè usage cũ bằng lần chạy cuối.

Stage: `brief → research → storyboard → production → final → complete`.

Activity state riêng: `draft | queued | running | waiting_review | blocked | failed | idle`. Archive là cờ riêng. Complete chỉ nghĩa gói đã duyệt, không nghĩa đã đăng hoặc có doanh thu.

Các transition và approval được kiểm ở server, không tin hidden form field/cookie. Lưu review + chọn artifact + enqueue successor trong transaction phù hợp. Với hai tab cùng mở, một approve dựa trên version cũ phải bị từ chối và yêu cầu tải lại. Double submit không enqueue trùng.

Mỗi job chỉ ghi kết quả vào nhánh active khi revision/dependency vẫn khớp. Kết quả job cũ được giữ làm lịch sử hoặc stale, không ghi đè revision mới. Retry không tự tạo review hoặc vượt cổng.

## 10. Sửa, stale và khôi phục

- Sửa brief/phạm vi/claim/source: mất hiệu lực research approval và mọi phần sau phụ thuộc.
- Sửa lời dẫn, spoken text, hình hoặc giả định trong storyboard: tạo storyboard revision mới, duyệt cổng 2 lại; cổng 1 chỉ giữ khi claims/evidence và phạm vi không đổi.
- Sửa profile không tự đổi tập đang làm; muốn áp dụng phải tạo snapshot/revision mới và invalidate phần liên quan.
- Sửa thumbnail/metadata bản cuối: không mất duyệt research/storyboard, nhưng mất duyệt gói cuối.
- Lỗi phát âm sửa qua cue editor; tái dùng audio khác có fingerprint khớp. Render lại toàn bộ tập trong MVP là chấp nhận được; không hứa render tăng dần từng frame.
- Góp ý theo scene ID; chọn timestamp chính xác, tự phân loại sửa tinh vi và visual diff nâng cao để sau.
- Có thể yêu cầu sửa hoặc lưu trữ một video; archive không hard-delete files và không để job đang chạy tiếp tục kích hoạt downstream mới.
- Output ghi tạm rồi publish atomically; chỉ file hoàn chỉnh mới ready. Không gán ready nếu upload file/manifest mới hoàn tất một phần.

## 11. Lỗi, chi phí và quyền thực thi

Không chọn nhà cung cấp/model LLM mới trong spec; mặc định giữ integration 9router hiện có, chọn model rõ trong profile. Không silently fallback provider/model. TTS adapter chỉ chọn sau khi xác nhận voice, quyền sử dụng và khả năng thực tế của dịch vụ.

- Nội dung sai: một lần sinh + tối đa hai lượt sửa, sau đó blocked để người xem xét. Mọi lượt tính vào chi phí.
- Lỗi mạng đọc nguồn có thể thử lại có giới hạn. Timeout dịch vụ có phí khi không biết đã xử lý chưa: đánh dấu kết quả chưa chắc chắn và chặn tự gửi lại, trừ khi dịch vụ có idempotency được xác minh.
- Kiểm tra retry của queue chung trước khi tích hợp: handler phải đưa lỗi nội dung/chi phí/uncertain-result về nhánh dừng phù hợp, không để runner tự trả phí ba lần.
- Giới hạn mỗi run, mỗi video, toàn tháng theo đơn vị tiền đã cấu hình; không đặt con số tiền mặc định khi user chưa chọn ngân sách.
- Khi nhà cung cấp có usage/giá có thể kiểm chứng, dùng dự trù bảo thủ và reservation trước khi gửi; cộng dồn mọi attempt và không reserve trùng. Phải giới hạn lượng đầu vào/đầu ra phù hợp nếu provider hỗ trợ đã được xác minh.
- Không có đơn giá hoặc upper bound đáng tin: hiển thị “chưa xác định”, chỉ chạy từng chặng sau khi user xác nhận rõ phạm vi chi phí chưa biết; chặn tự chạy chặng tiếp theo có phí. Không hứa hard cap tiền thực trả upstream khi không thể kiểm soát.
- Chi phí phân biệt actual, estimated và unknown; dịch vụ local không được tự coi là tổng chi phí bằng 0. Hết ngân sách dừng trước lượt tiếp theo, không hủy lịch sử hoặc tự tăng hạn mức.
- Không gọi dịch vụ có phí để nghiệm thu/benchmark nếu user chưa cho phép ngân sách cho lần đó.

Không thêm auth toàn app trong scope. Repo hiện có thể publish không đăng nhập; **không đặt Automation có quyền tiêu tiền lên public tunnel không có kiểm soát truy cập**. Trước khi bật đường chạy có phí phải có rào ở tầng triển khai (ví dụ hạn chế truy cập upstream do chủ hệ thống cấu hình) hoặc giữ local/private. Đây là điều kiện vận hành, không tuyên bố app mới đã có auth. Server action không tự đồng nghĩa authorization.

## 12. Gói đầu ra

Bản cuối mặc định 1920×1080, 30 fps, H.264 MP4; âm thanh có định dạng playback tương thích được xác minh ở triển khai. Không upscale cảnh dọc cũ để giả video ngang.

Gói export có thể tải theo từng file và một archive chứa:

- `video.mp4`, `subtitles.srt`, `thumbnail.png`.
- `metadata.json`: title, description, chapters và nhắc người đăng kiểm tra disclosure/phân loại audience.
- `sources.md`: danh sách nguồn và attribution, không toàn văn bên thứ ba.
- `manifest.json`: schema version, video ID, hashes, artifact/review dependencies, cấu hình format và danh sách file.
- `editorial.json`: brief, claims, kịch bản/storyboard và thông tin phiên bản dùng để sửa; không secret, prompt chứa bí mật hoặc đường dẫn tuyệt đối máy chủ.

Các file đều thuộc cùng phiên bản đã duyệt; checksum sai hoặc thiếu file thì chặn ready/download archive. Hash và các phiên bản được chốt trước cổng 3; archive chỉ đóng gói bộ đó. Tạo lại metadata/thumbnail sau duyệt buộc duyệt gói mới. Không hứa chức năng import editorials vào dự án khác trong MVP.

## 13. Năng suất và đo pilot

Mục tiêu vận hành sau khi ổn định: khoảng một video/tuần với 5 giờ người/tuần. **Không phải cam kết kỹ thuật hay kết quả đã đo**. Ước lượng từ video algorithm dọc ngắn không áp dụng sang explainer ngang dài.

Pilot gồm ba tập nội dung khác nhau dùng các primitive hỗ trợ: ví dụ Wi-Fi, giao nhận và hàng đợi. Tính đủ nghiên cứu, duyệt nguồn, sửa, xem bản cuối, export, chi phí dịch vụ và công chuẩn bị. Nguồn khán giả và hiệu quả kinh doanh do người vận hành ghi thủ công; không xây analytics pipeline ở MVP.

Ghi nhận per run/video: thời gian chờ, máy chạy, lượt sửa, token/audio/render usage có thể đo, actual/estimated cost. Người dùng nhập thời gian làm việc chủ động; thời gian tab mở không được coi là giờ lao động chính xác.

Chưa có benchmark nên không cam kết giờ render hoặc sản lượng khi lên C. Chỉ nâng mức đầu tư sau khi có quy trình lặp lại được, dữ liệu nhu cầu và mô hình kinh tế phù hợp.

## 14. Điều kiện nghiệm thu và xác minh

Đây là tiêu chí hành vi, **không phải yêu cầu viết/chạy file test**. Tuân thủ AGENTS.md: không tự tạo hoặc chạy test; lint/typecheck/build được phép khi triển khai. Nếu muốn automated tests, phải có yêu cầu và plan test được duyệt riêng. Những lượt chạy thật dùng dịch vụ có phí cần user cho phép cụ thể.

Tiêu chí:

1. Automation mở được độc lập trong cả hai mode; không cần series/project/design và không làm mất chức năng cũ.
2. Có một profile; lưu draft khi chưa cấu hình, chặn production khi thiếu cấu hình cần thiết.
3. URL chưa fetch không thành evidence; thiếu bằng chứng cho kết luận trung tâm thì không qua cổng 1.
4. Nguồn không điều khiển workflow; URL nội bộ/redirect nguy hiểm bị chặn.
5. Chỉ render từ storyboard đã duyệt và preview hợp lệ; unsupported scene có phản hồi trước production.
6. Sửa revision làm stale đúng dependencies; approve stale và double submit không làm lọt cổng.
7. Worker chạy lại/khởi động lại không nhân đôi artifact hay charge đã xác định; uncertain charge bị dừng để xử lý.
8. Voice, phụ đề và hình khớp artifact; thời lượng ngoài mục tiêu cần quyết định rõ.
9. Gói đúng checksum, không thiếu file hoặc secret; không có upload YouTube.
10. Chạm giới hạn hoặc còn chi phí unknown không được phép tự chạy tiếp trái policy.
11. Mở/tải/export Automation không yêu cầu xóa/sửa data Cartoon/Bài giảng.

Tiêu chí kiến thức và chất lượng nghe/nhìn phải do người duyệt chịu trách nhiệm, không dùng LLM judge làm bằng chứng duy nhất.

## 15. Chia phần thực thi sau khi spec được duyệt

Spec này xác định ranh giới sản phẩm và các hợp đồng. Kế hoạch code chi tiết chỉ viết sau khi user duyệt bản văn bản này.

- Nền tảng: domain/data/version/approval, profile, UI và artifact inspection.
- Nghiên cứu: safe fetch, snapshots, claims/evidence và cổng 1.
- Nội dung/hình: storyboard schema, planner/validator, renderer primitives, preview và cổng 2.
- Production: audio/timeline/render, cổng 3, metadata/thumbnail và export.
- Ổn định vận hành: sửa theo scene, cache, ledger ngân sách và chạy pilot có cấp phép.

Đây là các mốc xây dựng trong một MVP, không phải năm tính năng độc lập được phép ship mà bỏ qua các invariants an toàn. Không cần xây research agent tổng quát, search provider mới hoặc sửa các phần cũ không liên quan.

## 16. Nguồn đối chiếu và giới hạn xác nhận

- Hiện trạng repo: `package.json`, `package-lock.json`, `Dockerfile`, `src/components/app-sidebar.tsx`, `src/lib/db/schema.ts`, `src/lib/ninerouter/client.ts`, `src/lib/ninerouter/tts.ts`, `src/worker/llm-structured.ts`, `src/worker/runner.ts`; đã đọc có mục tiêu trong phiên này.
- Remotion renderMedia: https://www.remotion.dev/docs/renderer/render-media — xác nhận render chương trình, composition/input props và H.264. Không chứng minh throughput hoặc mọi API của bản 4.0.537; phải đối chiếu API/kiểu đang cài khi viết code.
- OWASP SSRF Prevention: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html — allowlist, kiểm IP/DNS/redirect và bảo vệ fetch nguồn.
- YouTube monetization: https://support.google.com/youtube/answer/1311392?hl=en — định dạng nhất quán không thay thế giá trị/nguyên bản; không bảo đảm YPP.
- YouTube synthetic content disclosure: https://support.google.com/youtube/answer/14328491?hl=en — người đăng phải đánh giá theo nội dung thực tế; không hardcode một cờ false cho mọi video trong tương lai.

Chưa chọn search API, chưa kiểm quyền thương mại mọi voice/font/icon và chưa benchmark dài 4–6 phút. Đây là các cổng xác minh của triển khai; chức năng liên quan phải dừng khi chưa đạt, không được tự thay thế bằng giả định. Remotion license phải xác nhận theo tình hình vận hành lúc triển khai; không tự kéo dài xác nhận ba người vận hành cũ sang quy mô mới.

## 17. Cổng phê duyệt tiếp theo

User đọc và duyệt rõ **spec bằng văn bản này**. Sau đó mới dùng writing-plans để viết kế hoạch triển khai; user tiếp tục duyệt plan và chọn cách thực thi trước khi sửa code/schema. Không tự commit hoặc push khi user chưa yêu cầu.
