# Heist voiceover smoke — checkpoint

2026-10-24. User yêu cầu smoke theo https://www.youtube.com/watch?v=jgYYOUC10aM.

**Cập nhật mới nhất:** user đã nói **“duyệt bước asset, tiếp tục”**; cả6asset/base variant đã chuyểnapproved, có6review records theo đúng approval chat và hash đã duyệt. Design riêng `5d560c7d-4f4b-4d3e-bd26-ee8b949a87a1`; kịch bản productionv2 đã qua script.generate/validation và đangpending_review; đã có6ảnh preview bố cục. Chưa có audio/timeline/scene DB rows/MP4 mới. TTS discovery vẫn0model.

Asset generation trước đó:6/6job asset.generate_base succeeded ởattempt1, hoàn toànảnh mới. Series `df751df7-7ea6-41b1-b15d-4e6e135ecd01`; manifest tạo ảnh `data/experiments/remotion-heist/2026-10-24-r1/assets.json` giữcheckpointpending_review lịch sử. Approval hiện hành nằm tại`asset-approval.json` vàDB. Không copy/import ảnh cũ; Puno chỉ kế thừa mô tả nhận diện.

## Handoff script/layout sau duyệt asset

- Mở kịch bản: http://127.0.0.1:3000/designs/5d560c7d-4f4b-4d3e-bd26-ee8b949a87a1 (HTTP200, hiển thị dialogue). Design cũ và5scene failed không bị sửa.
- Scriptv2ID `8fbdcb64-891c-4c7f-a465-ee586f435102`, modelag/gemini-3-flash; job `1937e496-4fb6-49e6-930e-e9154e5a9384`, succeeded/attempt1/internalwrites1; validation`l1-script-v1` pass. Brief yêu cầu3beat4s+13s+13s và giữ6câu thoại mới đã chuẩn bị; outputkhớp lời thoại/thời lượng với preview theo canonical hash, không so JSON key order. Toàn bộ output+metrics/validation được lưu`generated-script.json`.
- Manual staging scriptv1ID `f518b718-569b-40ec-8d91-c944bbfe613f` vẫn giữdraft, khôngapproved/rejected; đây là bản bố cục nội bộ ban đầu, không phải bằng chứng script.generate. Chỉv2đangpending_review để tránh duyệt nhầm draft nội bộ.
- `prepared.json` và`scene-drafts.json` có3SceneDSLv1,900frame tổng, đã qua schema+checkSceneDsl với đúng catalog6asset approved. Chưa insert sceneDB khi script chưa được duyệt, chưa gọiscenes.generate.
- Preview dùng **production VideoComposition/SceneView** qua Remotion4.0.537 renderStill, snapshot/rehash6PNG đã duyệt. Các frame60/210/450/660/840/899 tại`layout/frame-*.png`,1920×1080. Đã mở xem60/450/840: backgroundcover, cảhai nhân vật/chân trên mặt bến, bàn ở sau nhân vật, thùng riêng giữa hai người, caption đọc được. Mặt bến chủ ý overscan phía dưới; đây là ảnh review bố cục, không phải render có tiếng và không tạo rendersrow.
- `layout/manifest.json` ghi imagehash/lockhash/inputProps/frameoutputs/scriptIDv2; `dialogueAndDurationsMatchGenerated:true`. Scene motion được tác giả manual đề xuất, chưa gọiLLM scenehandler hoặc coi layout này đã được user duyệt. Sourcehelper`prepare.ts` archive`.ts.txt`; ESLint và targetedtsc exit0.
- Các approval còn lại: kịch bản/bố cục; sau đó scenes chính thức; audio take vàtimeline khi có file/model. User mới duyệtasset nên không tự đánh dấuapproved cho script/scenes/audio. Spec lồng tiếng đã duyệt giữ các gate này; không dùng silentMP4 để vượt smokeaudio.
- Docker local từng dừng giữa các lượt chat, đã khởi động lại Docker Desktop và xác minh apphealthy/worker/DB trước ghiapproval. Lần CLI đầu gặpECONNREFUSED nên không ghiapproval/data; rerun sauDBready thực hiện thành công, không tạo project/design trùng.

Nguồn API still-render: Context7`/remotion-dev/remotion/v4.0.537`, [renderStill official4.0.537](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/renderer/render-still.mdx). Không sửa productioncode/schema/dependencies trong bước chuẩn bị này.

Scope mới: background xa1920×1080; mặt bến1920×1080; Puno1024×1024; Eli (nhân vật đối đáp mới)1024×1024; thùng đồ ăn1024×1024; bàn1024×1024. Size là yêu cầu, ghi riêng source/processed actual theo pipeline dimension; background dùng cover khi ghép như yêu cầu trước. Mặt bến và bàn là phần tĩnh tách riêng; nhân vật/thùng là foreground riêng. Mỗi asset tối đa1job base do helper khởi tạo, không vòng lặp regenerate; queue có retry policy hiện hữu, phải báo attempts thực tế. Không có ảnh ghép hoàn chỉnh đem dùng như một asset duy nhất.

Helper manual: `scripts/spikes/remotion-heist/assets.ts init|next|status`. Command lock và started marker chống init trùng; lưu assetId trước enqueue, recover job theo targetId nếu crash trước lưu jobId. Không có approval writes hoặc downstream jobs. Duyệt ảnh vẫn qua gate hiện có. Các đoạn “chưa phát sinh job” bên dưới là lịch sử checkpoint trước yêu cầu asset mới, không phải trạng thái hiện hành.

## Kết quả phần asset mới

Trang duyệt: http://127.0.0.1:3000/series/df751df7-7ea6-41b1-b15d-4e6e135ecd01 (HTTP200, có Puno và bàn mới).

| Asset | ID | PNG sau xử lý |
|---|---|---|
| Background xa | 0c37056f-6e6e-4c5b-82b7-da6712af3586 | 1376×768 |
| Mặt bến | a7fd71e4-7b4c-4bb9-9680-4f9beadb7b1f | 1236×429 |
| Puno mới | 7663c172-9954-48d2-a6cc-b74007a18fa7 | 688×912 |
| Eli mới | bdb150b7-3298-42ee-8ab6-83ec867785eb | 442×894 |
| Thùng đồ ăn | 349949d7-2852-4ed6-bb75-38f8a270109d | 723×641 |
| Bàn | 258ff011-1735-417d-abb6-e8a859e0df75 | 812×424 |

Đã mở xem từng PNG. `provenance.json` ghi job IDs/attempts/model/requested/wire/source/processed dimensions/SHA256; tất cảhash khớpmanifest và không trùnghash PNG thuộc các series cũ. Cả5sprite/prop có alpha0 và0pixel xanh đậm opaque theo phép đo (g>150,r<100,b<100); RGB còn xanh dưới alpha0 là dữ liệu trong suốt, không phải nền xanh còn hiển thị khi composite đúng. Không sửa ảnh sau pipeline hoặc dùng image provider khác.

Background xin1920×1080, provider trả1376×768; PNG giữ nguyên source, cover vào1920×1080 khi ghép. Horizon quan sát khoảng0.655, khác0.40đề nghị; cần xác nhận ground/layout theo ảnh thực tế trước render, không tự dùng0.40để đặt chân/scale. Source helper đã archive `.ts.txt` để không bị root tsc quét như mã runtime; hashCF909C17F7262F24F5064EE5C64789BE692AC943462839234A25F7286E90CB94 khớp bản trong repo. Helper ESLint và targeted tsc đềuexit0; không formal tests.

Phần đã hoàn tất là **asset generation smoke**, không phải audio/video E2E. Chưa có script/scenes/take/timeline/render mới và chưa có MP4. Tiếp theo: duyệt6ảnh, chốt script/layout và có TTS/file giọng trước các gate tương ứng.

## Đã xác minh, chưa phát sinh job

- Nguồn: **Planning a Heist — Key & Peele**, kênh Key & Peele, metadata CLI61giây; browser video61.421giây. Trang/video truy cập được, đã pause sau khảo sát. Không tải video/audio, không chép transcript hoặc đưa lời gốc vào TTS.
- Đã dùng Context7 `/yt-dlp/yt-dlp`, official CLI docs; yt-dlp có sẵn2026.08.19, metadata-only không download. Nguồn tiêu đề/thời lượng: YouTube gốc. [Tóm tắt tình huống để tham khảo](https://simkl.com/tv/25993/key-and-peele/episode-4/): hai người bàn kế hoạch ngân hàng, nhầm công việc nhận lương lâu dài thành một vụ cướp. Không dùng tóm tắt đó làm bằng chứng đã xem toàn bộ thoại.
- Ảnh user đính kèm là bảng bài lập trình, không phải storyboard/video frame; tạm lấy YouTube làm nguồn chính, chờ user sửa nếu ảnh có mục đích khác.
- App/worker/Supabase local đang chạy. Module discovery thật trả `ttsModels:[]`. Không có model/voice để chọn hoặc gửi TTS qua endpoint chung; không tự dùng provider/endpoint khác.
- Production design hiện có1script approved/5scene failed; không sửa/tráo script hoặc scene đó. Smoke mới cần design riêng và đi qua review gates production.
- Catalog approved có Puno và dock worker; các background hiện có đều bến cảng Boston, chưa có bối cảnh lập kế hoạch/ngân hàng. Có thể tái dùng nhân vật; bối cảnh/đạo cụ phải tách asset riêng nếu cần sinh thêm. Không dùng ảnh bảng bài lập trình làm background.

## Đã chốt ngôn ngữ; bản thoại đề xuất

User đã chọn **thoại mới tiếng Anh cho Puno**. Đề xuất smoke30giây,1920×1080@30fps,3shot để phù hợp ScriptDSLv1 (targetSeconds tối thiểu30, ít nhất3beats), kiểm audio qua ranh giới cảnh. Thoại cụ thể dưới đây là bản nháp mới của agent, chưa gửi provider hoặc ghi DB.

Tên: **Operation: Lunchbox**. Mượn tình huống hai nhân vật bàn kế hoạch táo bạo; câu chuyện và punchline mới. Đề xuất tái dùng Puno + dock worker + background/pier/crate đã duyệt của Boston smoke, đặt tại bến cảng để chưa phải sinh thêm asset. Đây là lựa chọn tiết kiệm cho smoke, không phải dựng lại bối cảnh ngân hàng của video tham chiếu. Nếu user cần bối cảnh ngân hàng, phải bổ sung asset scope trước khi sinh ảnh.

- Shot1,0–4s (frames0–119), hai nhân vật nhìn thùng: Puno — **“Nobody leaves this pier hungry.”**
- Shot2,4–17s (frames120–509), camera gần Puno rồi worker reaction: Puno — **“Distract the guard. I'll grab the crate. We vanish.”** Worker — **“Puno, that's the free lunch box.”**
- Shot3,17–30s (frames510–899), reaction và punchline: Puno — **“Then our getaway vehicle is... a table.”** Worker — **“And the masks?”** Puno — **“Napkins.”**

Có khoảng reaction/pause để giữ nhịp; đây là dự kiến hình, không gán timestamp tiếng nói trước khi có file thực. Mọi câu <84ký tự. Không sinh thêm state, không rig/lipsync; dùng whole-sprite/state hiện có. Không giả định production SceneView có đủ cả các lớp/motion của Boston composition riêng; asset placement phải qua SceneDSLv1/checkSceneDsl thực tế.

Đề xuất tối đa1TTS take cho4câu của Puno, sau khi nghe thì cắt thành các clip nguồn; không gọi4lần hoặc tự đổi playbackRate. Nếu kiểm đủ nhánh upload, một file worker do user chỉ định chứa2câu của worker rồi cắt ghép. Chưa có file đó hoặc model/voice TTS; chưa chốt timestamp trim. Preview bằng cùng VideoComposition, sau đó tối đa1production render có tiếng khi đủ approvals. Không chạy silent render để ghi PASS lồng tiếng.

Giữ Remotion và pipeline gốc; asset ảnh tách riêng, audio take độc lập. Viết thoại mới cho tình huống hài, không dựng lại nguyên văn kịch bản/video nguồn. Đây là checkpoint đầu vào, chưa phải script đã được user duyệt.

## Điều kiện tiếp tục execution

1. Chốt ngôn ngữ/thoại và asset scope dựa trên phản hồi user.
2. Router chung phải công bố ít nhất1model/voice có metadata dùng được. Cần người quản lý router cấu hình hoặc cấp quyền model cho API key hiện có; không yêu cầu user gửi key vào chat.
3. Có file giọng để kiểm nhánh upload nếu smoke cần đủ cả2nguồn; chưa giả định user cho phép dùng lại nguyên giọng từ YouTube hoặc sinh file bằng provider ngoài router.
4. Chuẩn bị script/scenes mới và review theo pipeline; không đánh dấu approved tự động để vượt gate. Model/voice/lời đọc/budget và quyền agent review phải cụ thể theo spec audio đã duyệt trước các job tương ứng.

Trước yêu cầu asset mới: chưa gọi model/job. Sau yêu cầu asset mới: đang thực hiện phần sinh asset qua LLM writer + image provider của pipeline gốc. Chưa tạo script/take/scene/render mới, không đổi schema/provider configuration. Không viết/chạy formal test. Smoke audio **chưa chạy**, chưa có MP4 mới.
# Kết quả smoke có tiếng — 2026-10-24

User trả lời “duyệt” sau khi được trình hai bản thoại và script/bố cục. Đã ghi nhận chat approval cho đúng các đầu vào này, thực hiện standalone render từ snapshot, không tự ghi review khác trong DB hoặc thay đổi production code. Các checkpoint pending phía dưới là lịch sử trước approval này.

Artifact: `data/experiments/remotion-heist/2026-10-24-r1/voiced-r1/heist-voiceover.mp4`. SHA256 `134c26363f74dc48073b469dba0d626ce18d11981bf0852858520010dbef03f3`, 11978865bytes. H264 1920×1080/30fps/900frames/30s; AAC48kHz stereo30.016s (container30.016s do packet AAC). ffprobe và full ffmpeg decode exit0. Sáu clip non-overlap, playbackRate1, không synthesis mới. Audio signal được đo ở cả sáu mốc thoại; đây không phải đánh giá nghe/phát âm bởi agent.

Tái dùng production `VideoComposition`/`VoiceoverTrack`, scene layout đã trình và sáu asset đã duyệt, snapshots rehash đúng; hai nguồn MP3 giữ nguyên. Source trims/placement và inputProps ở `voiced-r1/manifest.json`. Phụ đề câu Puno thứ hai kéo dài thêm9frames đến scene frame204 để chứa trọn giọng; tổng scene/video không đổi. Đã xem frame390 có background kín viền, chân trên bến, asset riêng và subtitle đúng; sáu PNG frame60/210/390/570/720/840 được xuất.

Lần launcher đầu dừng trong preparation, không có MP4 hoàn tất; đã resume từ snapshot/hashes nguyên vẹn bằng Node trực tiếp, không regenerate/gọi model. Source lưu ignored `.superpowers/edge-tts-audition/`, bản render helper đầu lưu `.txt` cạnh artifact. Không claim `scenes.generate`, `audio.generate`, `video.render` queue E2E hoặc UI catalog Edge đã triển khai. Không DB writes/formal tests/build/package changes trong bước này. Cần user xem/nghe MP4 để đánh giá chất lượng và timing thực tế.

Nguồn API đã đối chiếu Context7 `/remotion-dev/remotion/v4.0.537`, [renderMedia version4.0.537](https://github.com/remotion-dev/remotion/blob/v4.0.537/packages/docs/docs/renderer/render-media.mdx): cùng inputProps selectComposition/renderMedia, H264/AAC, concurrency2.

# Cập nhật voiceover 2026-10-24 (lịch sử trước duyệt)

User chọn Puno = Guy, Eli = Brian rồi yêu cầu tiếp tục smoke. Đã tạo hai file thoại đầy đủ từ đúng scriptId `8fbdcb64-891c-4c7f-a465-ee586f435102` trong prepared.json, không sửa lời: Puno4câu/Guy13.536s, Eli2câu/Brian3.636s. Hai outbound POST qua 9router, mỗi nhân vật một lần, HTTP200; MP3 mono16kHz, metadata và rehash file hợp lệ. Evidence `data/experiments/remotion-edge-tts/heist-dialogue-20261024-r1/manifest.json`; files `puno-guy.mp3`, `eli-brian.mp3`.

Đây là standalone audio smoke, chưa đi qua audio.generate/catalog mới; không DB write, không tự review/approve, chưa nghe đánh giá phát âm, chưa cắt/chia câu hay căn timeline. Không claim production E2E hoặc MP4 hoàn tất. Voice casting đã chọn; bản thoại cụ thể mới tạo, script/layout/scenes/timeline vẫn chưa có approval mới. Edge catalog spec/plan chưa được user duyệt implementation riêng. Không resume render trước các gate này.

