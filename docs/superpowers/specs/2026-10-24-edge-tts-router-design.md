# Edge TTS qua 9router — thiết kế bổ sung

Trạng thái: đề xuất, chờ user duyệt. Ngày: 2026-10-24. User yêu cầu khảo sát/chọn voice trước triển khai; William trong ảnh chỉ là ví dụ request, không phải voice đã chọn. Bổ sung thiết kế `2026-10-24-remotion-voiceover-design.md`; không thay thế luồng review/timeline/render đã duyệt.

## Voice đã chốt ngày 2026-10-24

User chọn **Eli = Brian** (`edge-tts/en-US-BrianMultilingualNeural`), **Puno = Guy** (`edge-tts/en-US-GuyNeural`) sau audition. Cả hai đã trả MP3 HTTP200. Gate chọn voice đã hoàn tất; approval implementation spec/plan vẫn riêng.

## Gate chọn voice trước implementation

Khảo sát tại `docs/DangLee_ImplePlan/EDGE_TTS_VOICE_RESEARCH.md`. Trước sửa product code/cấu hình local phải có kết quả audition và user chọn voice. Đề xuất audition riêng tối đa ba POST qua endpoint chung, mỗi voice một clip chứa cùng ba câu Puno/Eli, lần lượt `edge-tts/en-US-AndrewMultilingualNeural`, `edge-tts/en-US-BrianMultilingualNeural`, `edge-tts/en-US-GuyNeural`. Không retry/fallback nếu lỗi; không cần triển khai catalog để thực hiện khảo sát standalone. Chỉ chạy sau khi user yêu cầu rõ; không tự tạo/duyệt take trong DB. Bắt đầu implementation sau user duyệt cặp voice và spec/plan. Voice chốt thay William trong ví dụ cấu hình và smoke bên dưới; các đoạn William hiện tại chỉ minh họa wire contract, không phải default triển khai.

## Mục tiêu và quyết định

User chọn Edge TTS qua endpoint chung `https://router.studev.net/v1/audio/speech`, cung cấp mẫu body `{ "model": "edge-tts/en-AU-WilliamMultilingualNeural", "input": "Hello, this is a text to speech test." }`, nhận MP3 binary. Authorization lấy từ cấu hình server hiện có; không chép credential trong ảnh vào tài liệu, code hay log.

Repo thực tế: Next 15.5.28, React 19.1.0, Remotion/@remotion/media 4.0.537, Mediabunny 1.61.6. `src/lib/ninerouter/tts.ts` hiện chỉ cho model/voice qua discovery; cả action và worker gọi `resolveTtsModel`. Worker đã có persistent claim, một outbound attempt/take, probe/hash/storage và pending_review. Không cần Python, cài edge-tts, package mới hoặc nâng phiên bản.

## Bằng chứng và giới hạn

Read-only ngày 2026-10-24 với cấu hình server hiện có: GET `/models/tts` HTTP200/data rỗng; `/audio/voices?provider=edge-tts&lang=en` HTTP502 HTML; `/models/info?id=edge-tts%2Fen-AU-WilliamMultilingualNeural&kind=tts` HTTP404. Chưa POST speech. Không kết luận provider không tồn tại hoặc request mẫu chắc chắn chạy được; discovery và synthesis cần nghiệm thu riêng.

Nguồn Context7 `/decolua/9router`, official [TTS contract](https://github.com/decolua/9router/blob/master/skills/9router-tts/SKILL.md): speech body model/input, MP3 output, Edge voice identifiers. Request user cung cấp là bằng chứng cho deployment cụ thể; không coi master là phiên bản deployment đã xác nhận. Edge dùng dịch vụ online; không hứa offline hoặc chất lượng diễn xuất theo cảm xúc.

## Phương án đề xuất

Giữ discovery hiện có cho mọi provider. Thêm một danh sách voice được cấu hình rõ trên server dành riêng Edge TTS: `NINE_ROUTER_EDGE_TTS_VOICES`, JSON array strict `{id,label}`. `id` là đầy đủ wire ID `edge-tts/<voice-id>`; giới hạn 100 mục, không trùng ID; label 1..120 ký tự; ID chỉ nhận prefix `edge-tts/` cùng một voice token gồm chữ ASCII/số/gạch nối, tối đa 160 ký tự. Không nhận URL, dấu slash thứ hai, hoặc provider khác. Giá trị rỗng/không cấu hình nghĩa là không có voice bổ sung. Cấu hình sai báo lỗi rõ, không âm thầm bỏ qua.

Đây là quyết định agent đề xuất để dùng được request mẫu trong lúc discovery thiếu, không phải user đã đồng ý bỏ gate. Giá trị mẫu dự kiến sau duyệt: `[{"id":"edge-tts/en-US-GuyNeural","label":"Guy · English (US) · Puno"},{"id":"edge-tts/en-US-BrianMultilingualNeural","label":"Brian Multilingual · English (US) · Eli"}]`. Không hardcode toàn bộ voice nhìn thấy trong ảnh; danh sách mở rộng bằng cấu hình có nguồn cụ thể.

`listTtsModels` hợp nhất voice cấu hình vào một nhóm Edge TTS, cùng kiểu trả về hiện tại. Discovery lỗi/rỗng vẫn cho dùng voice cấu hình; UI thông báo discovery không khả dụng và nguồn cấu hình thủ công chưa được xác minh synthesis. Khi discovery thành công, khử trùng theo wire ID, ưu tiên label/nhóm discovery. Không sửa shape public hiện tại; trạng thái discovery có thể lấy qua helper server riêng để hiển thị cảnh báo. Không vô hiệu hóa provider khác khi chỉ một model metadata lỗi. Không cache thất bại vô thời hạn.

`resolveTtsModel` xác minh lại allowlist server tại enqueue và worker. Voice không thuộc discovery hợp lệ hoặc cấu hình rõ phải bị từ chối. Không thêm ô nhập model tùy ý trên browser. Xóa voice khỏi cấu hình sau enqueue khiến job chưa synthesis bị chặn; take hoàn tất vẫn bất biến và dùng được theo review hiện có. Cấu hình là cho phép gửi request, không chứng minh synthesis thành công hay có quyền upstream.

POST giữ `{model,input}`, endpoint chung + query `response_format=mp3` hiện có. Không thêm voice/speed/instructions/rate/pitch khi chưa có contract deployment. Timeout 120s, giới hạn audio25MiB/600s và text5000 ký tự là giới hạn Cartoon, không quảng cáo là giới hạn Edge. HTTP lỗi/timeout/audio hỏng phải failed, không tự fallback provider hoặc gửi lại. Key chỉ ở server. Claim chống redelivery giữ nguyên; không hứa router nội bộ không retry.

## UX và dữ liệu

Trang Lồng tiếng cho chọn nhóm Edge TTS/voice có nhãn đầy đủ, nhập văn bản và tạo take theo luồng hiện tại; không tự chọn voice để submit. Bản thu hiển thị model/voice đã lưu, nguồn cấu hình không bị trình bày như xác nhận upstream. Nghe → user duyệt take → timeline → user duyệt timeline → render vẫn giữ nguyên. Upload không phụ thuộc discovery thành công.

Không migration, không đổi DB types/SceneDSL/VoiceoverTimelineV1, không ghi đè take cũ. Model metadata hiện có tiếp tục lưu đầy đủ wire ID và label. Chỉ thay đổi chính sách chấp nhận model đã cấu hình rõ, cần approval tài liệu này trước code.

## Nghiệm thu và phạm vi

Implementation: lint, root/worker typecheck phù hợp cấu hình thực tế, Next build và Docker app/worker build. Không viết/sửa/chạy formal tests theo AGENTS. Kiểm tra UI đọc danh sách không tự gọi synthesis.

Smoke riêng sau khi user duyệt: đúng một take qua `audio.generate`, voice Guy đã chọn cho Puno, text `Hello, this is a text to speech test.`; một outbound POST tối đa, không retry nếu lỗi. Đo duration/hash/codec, nghe file, giữ pending_review chờ user. Không tự duyệt take, script, scene, timeline; không tự resume Heist/render MP4 trong scope này. Plan approval không tự cấp phép smoke; cần user yêu cầu chạy smoke rõ ràng. Upload/render audio E2E của tính năng trước vẫn là nghiệm thu riêng.

Ngoài scope: local Python TTS, Azure SDK, voice cloning, SSML, cảm xúc, subtitles/STT, auto alignment, sửa router admin hoặc public/cloud deployment. Không commit/push.
