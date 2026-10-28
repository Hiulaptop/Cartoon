# Khảo sát voice Edge TTS cho Puno và Eli

Ngày 2026-10-24. User đã yêu cầu bắt đầu audition: ba clip đã synthesis thành công, chưa nghe/chọn chính thức hoặc triển khai product. User chọn thoại tiếng Anh, qua 9router, muốn chọn voice trước code. Repo Remotion4.0.537/Next15.5.28; không cần nâng phiên bản để chọn giọng.

## Quyết định của user

Sau audition, user chọn **Brian cho Eli**, **Guy cho Puno**. Wire IDs: `edge-tts/en-US-BrianMultilingualNeural` và `edge-tts/en-US-GuyNeural`. Andrew không được chọn. Các shortlist/đề xuất phía dưới là lịch sử khảo sát, không ghi đè quyết định này. Chưa triển khai product hoặc gọi thêm TTS.

## Kết quả audition thực tế

Run `data/experiments/remotion-edge-tts/audition-20261024-r1/`: đúng ba outbound POST, mỗi voice một lần, tất cả HTTP200/audio-mp3. Andrew 7.956s/31824bytes; Brian7.992s/31968bytes; Guy8.928s/35712bytes. Cả ba MP3 mono16kHz; đã probe codec/duration và rehash file sau ghi. `manifest.json` lưu text/wire IDs/SHA256/metadata, không secret. Không retry, không DB write/take/approval, không sửa product hoặc tạo video. Chưa đánh giá nghe: cần user nghe ba file chọn cặp; metadata không chứng minh chất lượng phát âm/diễn xuất.

Synthesis thành công chứng minh ba wire ID dùng được với credential hiện có tại thời điểm gọi, dù discovery trước đó lỗi/rỗng. Không suy ra các voice khác dùng được hoặc toàn bộ provider đã nghiệm thu.

## Căn cứ

- Ảnh dashboard user cung cấp có AndrewMultilingual, BrianMultilingual, Guy, Christopher, WilliamMultilingual. Đây là bằng chứng UI hiển thị, không chứng minh key hiện tại gọi thành công từng voice.
- Microsoft [language/voice support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support) xác nhận tên/locale/gender các giọng; Azure có nhiều voice và style hơn Edge. Không suy ra Azure styles/HD dùng được qua Edge/9router.
- Context7 `/rany2/edge-tts` và [README chính chủ](https://github.com/rany2/edge-tts): liệt kê voice và metadata; không hỗ trợ custom SSML tùy ý. Các nhãn personality không đủ để khẳng định giọng diễn hài tốt.
- [9router TTS contract](https://github.com/decolua/9router/blob/master/skills/9router-tts/SKILL.md): gửi model wire ID + input. Contract đang dùng không xác nhận truyền style/emotion/rate/pitch; audition dùng mặc định, chỉ thay voice.
- GET voices qua endpoint/key hiện có vẫn HTTP502 trong phiên khảo sát. Không POST. Không lấy catalog Azure thay thế xác minh live Edge.

## Tiêu chí casting (đề xuất của agent)

Puno đóng vai tự tin quá mức, nghiêm túc lên kế hoạch vô lý; Eli phản hồi bình thản. Ưu tiên cùng accent US để câu đùa không phụ thuộc khác biệt vùng miền, hai màu giọng phân biệt được trên loa laptop, lời rõ khi không lipsync. Không mặc định chim cánh cụt phải giọng trẻ em hoặc pitch cao. Không mô phỏng giọng diễn viên video tham chiếu.

## Shortlist

- `en-US-AndrewMultilingualNeural`: ứng viên Puno thứ nhất; lựa chọn để audition, chưa khẳng định chất giọng khi chưa nghe.
- `en-US-BrianMultilingualNeural`: ứng viên Eli thứ nhất, đồng thời so chéo vai với Andrew; cần nghe độ tương phản, không mặc định tên khác là đủ khác giọng.
- `en-US-GuyNeural`: ứng viên dự phòng cho cả hai vai nếu cặp đầu chưa phân biệt rõ.
- `en-US-ChristopherNeural`: dự phòng sau vòng đầu, không tăng số request ban đầu.
- `en-AU-WilliamMultilingualNeural`: giữ làm lựa chọn accent Australia khi user muốn; không chọn chỉ vì xuất hiện trong request mẫu. Accent khác US là quyết định casting, không phải lỗi kỹ thuật.

Đề xuất sơ bộ: Andrew cho Puno, Brian cho Eli; chưa phải quyết định cuối hoặc đánh giá đã nghe. Multilingual không tự chứng minh hay hơn với thoại chỉ tiếng Anh. Không bắt buộc multilingual hoặc mua provider khác.

## Audition trước code (chờ user yêu cầu chạy)

Tối đa ba POST, ba voice shortlist đầu. Mỗi clip cùng văn bản nguyên gốc:

> Nobody leaves this pier hungry. Puno, that's the free lunch box. Then our getaway vehicle is... a table.

Một clip/voice giúp so cùng nội dung, không chia thành chín request. Model đầy đủ thêm prefix `edge-tts/`. Dùng endpoint/key server hiện có, MP3 binary, giữ timeout/size bounds hợp lý từ luồng audio hiện tại. Không thay endpoint/provider, không truyền cảm xúc chưa có contract, không retry lỗi. Lưu dưới ignored `data/experiments/remotion-edge-tts/audition-<run-id>/`, manifest chỉ text/voice/status/hash/duration; không secret/raw errors. Đây là khảo sát standalone, không claim audio.generate/production E2E, không thêm DB take hay approval.

Nghe ba clip để chọn: (1) từ rõ và trọng âm tự nhiên, (2) ngắt câu lunch box/table tạo nhịp hài, (3) hai vai phân biệt trên loa laptop, (4) không đọc quá nhanh so slot cảnh. Không chấm âm sắc bằng metadata; user nghe quyết định cặp, có thể đảo Andrew/Brian. Không ép time-stretch để vừa cảnh trong vòng chọn giọng.

Sau khi user chốt cặp voice: cập nhật spec/plan/cấu hình mẫu đúng IDs, trình approval implementation nếu chưa có. Giữ các gate script/layout/scenes/timeline Heist chưa duyệt. Không xuất MP4 trong giai đoạn khảo sát.
