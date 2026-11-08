# English voice workflow — thiết kế giai đoạn 2

Ngày: 2026-10-30.

Trạng thái: **user đã duyệt written spec trong chat ngày 2026-10-30**, bằng phản hồi “dươc”; sau khi nhận implementation plan đã chọn **“native”**, cho phép triển khai inline và một review độc lập cuối. Không cấp quyền inference mới, cài đặt hoặc thay đổi production; các cổng runtime/listening vẫn riêng.

## 1. Ý định và kết quả mong muốn

Người dùng phát triển kênh tiếng Anh, cần quy trình giọng đọc có thể dùng lại thay vì script riêng cho ba video demo. Chất lượng phải được nghe và duyệt, không suy ra từ WAV không im lặng hoặc video render thành công.

Giai đoạn này xây một công cụ local hữu hạn: văn bản đã duyệt → từng cue Qwen → WAV và metadata có provenance → timeline theo thời lượng thật. ComfyUI tiếp tục sinh hình, Qwen sinh giọng ngoài ComfyUI, Remotion tiêu thụ artifact sau này. Không gọi đây là graph full-video trong ComfyUI.

Thành công gồm:

- Người vận hành chọn được ba kiểu đọc rõ ràng, biết chính xác text/instruction/settings nào được dùng.
- Clip chỉ được tái sử dụng khi input fingerprint và artifact đã kiểm khớp; không nhầm clip cũ khi đổi model/settings.
- Có thể dừng rồi tiếp tục mà không ghi đè âm thầm hoặc sinh lại toàn bộ.
- Timeline dùng số sample thật; không giả word timestamps, không cắt hoặc tăng tốc để ép thời lượng dự kiến.
- Phân biệt artifact hợp lệ, inference thành công, nghe đạt và production release.

## 2. Hiện trạng đã đọc

### Repo

Đọc package.json/package-lock.json ngày 2026-10-30: Next.js 15.5.28, React 19.1.0, Remotion và các @remotion/* 4.0.537, TypeScript lockfile 5.9.3. Đây là một app ở root; giữ dirty checkout `feat/mode-switch`. Không đổi dependency JS trong giai đoạn này.

### Demo tiếng Anh

- `src/worker/qwen_english_video_voice.py`: script throwaway, CPU float32, SDPA, 6 compute threads/2 interop threads, model local offline; Ryan, English; `generate_custom_voice` theo từng section, seed `731000+i`, max_new_tokens 420, do_sample true, top_p 0.9, temperature 0.8.
- Script hiện chỉ đối chiếu text/tone khi dùng lại WAV+JSON, không fingerprint model/runtime/settings hoặc kiểm checksum. Nó ghi WAV và metadata riêng, chưa có commit boundary bền vững cho cặp file. Không nâng script này thành production bằng cách đổi tên.
- `src/worker/qwen-english-render.mjs`: phụ thuộc cứng ba video × sáu cue, đọc `timelines.json`; không phải renderer tổng quát.
- Demo dùng 30 fps, audio bắt đầu sau 6 frame, mỗi cue có thêm tổng 21 frame (6 trước + 15 sau). Chưa có word alignment.
- `data/spikes/qwen-tts-20261030/english-progress.md`: 18 cue đã sinh và ba MP4 hoàn tất; không có human-listening/prosody acceptance. Đây là bằng chứng cũ, không nghiệm thu công cụ mới.

### Môi trường local đã đọc, không chạy inference

- Venv metadata: Python 3.12.10, qwen-tts 0.1.1, transformers 4.57.3, torch 2.15.0+cpu, torchaudio 2.11.1+cpu, soundfile 0.14.0, numpy 2.5.4.
- Download manifest: `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`, revision `0c0e3051f131929182e2c023b9537f8b1c68adfe`, license apache-2.0. Completion ledger ghi tải xong ngày 2026-10-30.
- Model safetensors kỳ vọng: 3,833,402,552 byte, SHA-256 `38b1d5971bdbd982b561cccec982669a53b0537c3cf5e9bd4778ed07bb2f5137`; speech tokenizer safetensors: 682,293,092 byte, SHA-256 `836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258`.
- Các hash trên lấy từ download manifest, **không phải lần băm lại weights trong bước viết spec**. Implementation preflight phải kiểm inventory/hash file thực tế trước khi gọi model. Hash cấu hình/tokenizer cũng tham gia định danh bundle.
- Không coi môi trường này là compatibility matrix được upstream chứng nhận. Tài liệu Qwen minh họa CUDA; CPU là bằng chứng demo local, không cam kết latency/throughput. Không tự sửa phiên bản torch/torchaudio vì chỉ thấy khác số.

## 3. Phương án đã chọn và ranh giới

**Chọn công cụ local ngoài ComfyUI**, dùng lại model/venv hiện có. Không thêm HTTP service hoặc port. Giai đoạn này tạo artifact và hướng dẫn sử dụng; không nối vào job queue app.

Hai lựa chọn để sau:

1. Custom/bridge node trong ComfyUI: dễ điều khiển trên canvas nhưng thêm dependency, lifecycle và quyền thực thi; chưa cần để nghiệm thu giọng.
2. Tích hợp thẳng app/worker: cần contract/DB/UI/ownership và production acceptance riêng; không lẫn vào công cụ local.

### Không bao gồm

- Voice cloning, giọng người thật do user cung cấp, VoiceDesign, đổi speaker/model hoặc dịch tự động.
- Cài package/node/model, tải file, tự start/restart app/Comfy/container; GPU chuyển đổi hoặc benchmark.
- HTTP endpoint, Comfy node, sửa workflow pack ảnh, DB/schema/migration, .env/compose/registry/flags, public tunnel.
- Auto-writing nội dung bằng LLM, paid API, nhạc, mastering loudness, denoise/time-stretch, ASR/forced alignment, MP4/render/upload YouTube.
- Tạo/sửa/chạy test/fixture/mock; commit/push khi chưa có yêu cầu riêng.

## 4. Artifact và cấu trúc trách nhiệm

Implementation plan chốt đường dẫn module cụ thể sau khi spec được duyệt. Các đơn vị cần có:

- **Runner Python local**: CLI tách validation/preflight khỏi inference, điều phối tuần tự; script đặt ngoài thư mục model/download. Không sửa script/demo cũ.
- **Contract/validation và fingerprint**: dữ liệu JSON version 1 và hàm thuần, không import model khi chỉ validate. Không phải contract app/client/server/9router hoặc DB mới.
- **Ba preset version 1** và tài liệu dưới `workflows/voice/qwen-english/v1/`: README, preset data, provenance/settings manifest và acceptance record. Không đóng gói weights/audio vào thư mục này.
- **Artifact runtime local**: một output root do người vận hành chỉ định, chứa cache, immutable run request và manifests/timeline. Dùng thư mục mới, không ghi đè `data/spikes/...` demo. Evidence dưới data là local/gitignored, không được coi tự có sau clone.

Mặc định CLI chỉ validate/preflight, **không inference**. Lệnh thực thi phải có opt-in tường minh, ngân sách số cue mới hữu hạn và request ID. Cờ kỹ thuật không thay thế quyền của user trong chat. Không có tự download/fallback khi thiếu model.

## 5. Đầu vào version 1

Một request chứa:

| Trường | Quy tắc |
|---|---|
| version | chính xác 1 |
| requestId | ID an toàn cho file, 1–64 ký tự ASCII chữ/số/`_`/`-`; bất biến trong run |
| language | chính xác `English` |
| speaker | chính xác `Ryan` |
| fps | chính xác 30 |
| cues | 1–24 cue theo thứ tự phát, ID duy nhất |
| cue.id | cùng quy tắc ID an toàn, không path |
| cue.text | 1–400 ký tự Unicode, tối đa 60 whitespace-delimited words; không rỗng/toàn whitespace |
| cue.preset | một trong `clear-explainer`, `warm-story`, `engaging-hook` |
| cue.instruction | tùy chọn, chuỗi không rỗng tối đa 500 ký tự; nếu có thì thay instruction preset, không nối ngầm |
| cue.seed | số nguyên 0–2^32−1; bắt buộc, không phụ thuộc index hoặc đồng hồ |

Từ chối khóa lạ và dữ liệu sai trước khi load model. Chuẩn hóa duy nhất CRLF/CR thành LF; không tự viết lại từ, dấu câu, khoảng trắng nội dung hoặc phát âm. Lưu cả input gốc và effective text/instruction được chuẩn hóa. Giới hạn chữ/từ là budget local, không tuyên bố phân đoạn ngôn ngữ chính xác hoặc bảo đảm audio dài bao nhiêu.

Không hỗ trợ SSML/markup thực thi; text là lời đọc nguyên văn. Path model/output truyền riêng trên CLI, không lấy path/URL/command từ cue JSON. Không tự cắt cue quá dài; yêu cầu người vận hành sửa request và duyệt lại nội dung.

## 6. Preset và settings

Dùng cùng Ryan, English và model đã có; preset chỉ là instruction đã version hóa:

- `clear-explainer`: “Speak in clear, natural English with a calm, confident explanatory tone. Use a moderate pace and brief pauses between ideas. Emphasize key words without sounding theatrical.”
- `warm-story`: “Speak in warm, conversational English with a gentle storytelling tone. Use a relaxed pace and natural pauses. Keep the delivery sincere and avoid exaggerated character acting.”
- `engaging-hook`: “Speak in energetic but natural English with curiosity and a confident opening. Use crisp phrasing and purposeful emphasis. Do not shout or rush the words.”

Đây là candidate instructions, **chưa nghe nghiệm thu**. Tên preset không chứng minh audio thực sự đạt cảm xúc đó. Không cam kết exact words/minute, tốc độ ×, pause theo mili-giây hoặc duration nhờ `instruct`.

Baseline chạy: CPU, float32, SDPA, 6/2 threads, do_sample true, top_p 0.9, temperature 0.8, max_new_tokens 420. Đọc effective generation configuration của model/package; các default sampling còn lại không được âm thầm biến mất khỏi provenance/fingerprint. Chốt danh sách tham số được hỗ trợ theo API/package cài thực tế trong implementation plan; không thêm knob chưa xác minh.

Giữ seed từng cue trước inference. Không cam kết bit-identical giữa runtime/CPU/package khác dù cùng seed. Không chuyển model/provider/device nếu lỗi. Muốn hỗ trợ settings khác cần revision và nghiệm thu riêng.

## 7. Fingerprint và provenance

Fingerprint SHA-256 của JSON UTF-8 canonical: sort object keys đệ quy, giữ array order, không whitespace ngoài chuỗi. Chỉ dùng string/boolean/null và số finite với quy tắc encoding ổn định; không NaN/Infinity. Implementation dùng một authority Python để tính, không dựa vào hai serializer ngầm tương đương.

Đầu vào fingerprint cue gồm:

- fingerprint contract version và runner revision/hash code thực thi;
- effective text, English, Ryan, instruction resolved (không chỉ tên preset), preset version/override provenance, seed;
- model repo/revision và bundle inventory: relative paths, byte sizes, SHA-256 weights/config/generation config/tokenizer files dùng thực tế;
- qwen-tts/transformers/torch/torchaudio/numpy/soundfile và dependency inventory digest của venv; Python/platform/runtime device/dtype/attention/threads;
- toàn bộ effective generation settings kể cả default ảnh hưởng đầu ra; output format WAV PCM16.

Không hash absolute model/output path vào identity; di chuyển bundle không đồng nghĩa đổi nội dung. Không lưu secret hoặc toàn bộ environment. Model path chỉ là local input, không bằng chứng revision. Bundle phải khớp release inventory; không tự chạy file `.py` tải kèm hoặc remote code, không nhận URL làm model.

cue ID/thứ tự/fps/padding thuộc **run/timeline**, không thuộc waveform fingerprint. Đổi thứ tự hoặc padding không cần inference lại nếu clip được xác minh. Đổi text/instruction/model/settings/code/runtime identity thì không dùng clip cũ dưới fingerprint cũ.

Clip metadata gồm fingerprint, effective inputs/provenance, WAV SHA-256/bytes/format/channels/sampleRate/sampleCount, durationSeconds và kết quả kiểm kỹ thuật; trạng thái human listening ban đầu pending. Metadata input không phải transcription của waveform.

## 8. Cache, durability và chạy tiếp

Một output root có exclusive runner lock; tiến trình thứ hai phải dừng, không hai writer cùng cache/run. Stale lock cần đối soát và quyền thao tác riêng; không tự xóa/steal theo tuổi file. Đây là local single-writer workflow, không distributed queue.

- `runs/<requestId>/`: giữ request snapshot và request hash bất biến; cùng requestId nhưng nội dung khác phải từ chối, yêu cầu ID mới.
- `cache/<fingerprint>/`: WAV/metadata và commit record có hash liên kết. Chỉ tái sử dụng clip đã commit, hash/input đúng và decode kiểm lại được.
- Trước inference ghi attempt durable với trạng thái `generating`. Lưu output qua file tạm cùng filesystem; WAV và metadata hoàn tất, verify rồi mới publish commit record cuối cùng bằng atomic rename. Không coi một file tồn tại là clip thành công.
- Ledger cue: `pending`, `generating`, `ready`, `failed`, `needs_review`. `ready` chỉ là kỹ thuật/cache, không phải nghe đạt. Lưu lỗi cụ thể, attempt identity, không che lỗi bằng clip khác.
- Crash trong `generating`, orphan WAV/metadata, hash sai hoặc file hỏng: không tự ghi đè/xóa/sinh lại; ghi needs_review và dừng với cách đối soát. Nếu commit hợp lệ đã có nhưng run ledger chưa cập nhật, có thể phục hồi liên kết từ commit đã xác minh mà không inference.
- Clip lỗi nội dung không tự retry. Mọi lượt inference lại phải chủ động, có attempt mới và nằm trong budget được cấp; giữ bằng chứng cũ, không biến retry thành vòng sinh vô hạn.
- Khi hết ngân sách cue mới thì dừng, vẫn giữ các clip ready; cache hit không tiêu lượt inference nhưng phải được kiểm trước dùng.

Bảo vệ đường dẫn: ID không là path; kiểm resolved paths nằm trong root, từ chối symlink/junction dẫn ra ngoài và artifact không phải regular file. Không cho request đọc file tùy ý. Python đọc model/download luôn chạy với `-I`; không chạy interpreter từ thư mục model. Không overwrite demo hoặc root đã dùng cho mục đích khác.

## 9. WAV và timeline

Dùng sample rate **được Qwen trả về**, không đoán 24/48 kHz. Waveform phải numeric, một kênh, finite, số sample dương và sample rate nguyên dương trong 8,000–192,000 Hz. Chọn WAV PCM16; peak tuyệt đối đầu vào >1 hoặc max <0.001 phải dừng cần review thay vì âm thầm normalize/clip. WAV sau ghi phải decode, finite, mono và đúng sample count/rate; lưu peak/RMS/sample-clipping indicators để người vận hành đọc.

Giữ cảnh báo nghi ngờ demo: audio <1 giây hoặc ≥33 giây bị needs_review, không tự chấp nhận hoặc sinh lại. Bounds này là sanity policy cho cue ngắn, không chứng minh đúng lời hoặc phát hiện mọi trường hợp bị cắt/lặp do generation token cap. Không silence trimming, normalize, resample hoặc mastering trong stage này.

Timeline version 1 độc lập với renderer demo:

- 30 fps cố định; mỗi cue `audioFrames = ceil(sampleCount * 30 / sampleRate)` bằng số nguyên.
- `from` là đầu block; `audioStartFrame = from + 6`; `audioEndFrame = audioStartFrame + audioFrames` (exclusive); `durationInFrames = 6 + audioFrames + 15`.
- Block đầu từ 0, block sau từ tổng duration block trước; tổng run là tổng block, không overlap.
- Mỗi cue tham chiếu WAV relative path trong output root, fingerprint, hash, text/instruction provenance và số sample/rate. Caption window chỉ là mức cue theo audioStart/audioEnd, không word alignment.
- Chỉ publish manifest/timeline hoàn chỉnh khi mọi cue ready và input snapshot khớp. Partial progress ở ledger, không giả run hoàn tất bằng cách bỏ cue lỗi.

Không sửa renderer/demo để ép tiêu thụ schema mới. Giai đoạn 3 sẽ có adapter/render design riêng; timeline này chỉ giữ đủ dữ liệu và semantics rõ ràng cho Remotion sau này. Không render MP4 hoặc xuất SRT trong stage 2.

## 10. Cổng chạy và nghiệm thu

### A. Không inference

Sau khi implementation được duyệt: kiểm JSON/preset/paths/hash/settings/fingerprint, inventory bundle, CLI validation/preflight và đọc lại artifact đã có. Không import/load model trong validation thuần; không network/download. Không tạo hoặc chạy test files theo AGENTS. Lint/typecheck/build chỉ dùng nơi có code phù hợp và được báo kết quả thật; plan phải nêu cách kiểm Python không inference, không tạo fixture/mock/test trá hình.

Không tự chứng nhận lỗi/resume logic đã được runtime exercise chỉ bằng source review. Những nhánh chưa được phép thao tác phải ghi unverified.

### B. Inference cần quyền riêng

Đề xuất sau implementation: **tối đa 3 cue mới, mỗi preset một cue, mỗi cue 20–40 từ, tổng tối đa 120 từ; tuần tự, không tự sinh thay thế**. Cùng Ryan và model hiện có; không download, service, ảnh hoặc render video mới. Đây là đề xuất, **chưa được cấp quyền**.

Giữ transcript/instruction/settings/seed/fingerprint/hash/audio thật. Một lần resume chỉ kiểm và dùng lại clip đã commit không được ngầm gọi inference; nếu cần inference thì tính vào budget và xin quyền tương ứng. Không chủ động tạo crash/corruption để thử nhánh phục hồi nếu chưa có quyền riêng.

### C. Human listening

User nghe từng clip, xác nhận đúng tiếng Anh/lời đọc, không mất từ/cuối câu, lặp/âm lạ, nhịp dễ nghe, tone đúng mục đích, khoảng nghỉ tự nhiên. Ghi đánh giá gắn fingerprint và WAV hash; rejected/pending không được nâng thành accepted từ kiểm kỹ thuật. Không có ASR độc lập nên không tuyên bố speech/text match đã máy xác minh.

### D. Production

`not_released`; không Comfy node/app integration. Registry/flags/migrations giữ nguyên. Spec này không cấp quyền đưa pipeline có khả năng tiêu tiền lên public tunnel.

## 11. Bàn giao và phê duyệt tiếp theo

Bàn giao sau implementation phải có: công cụ local + ba preset + hướng dẫn validation/preflight/explicit execution/resume + hồ sơ model/runtime/hash + output contract/timeline + acceptance tách static/inference/listening/production. Không cần nhiều video mới để chứng minh stage giọng.

Thứ tự:

1. User duyệt **written spec này** hoặc yêu cầu sửa.
2. Viết implementation plan với file/API/CLI và validation cụ thể; user duyệt plan và chọn Native/Subagent-driven. Không tự kế thừa Native của pack ảnh.
3. Triển khai đúng plan, một review theo phương thức được chọn; không inference từ quyền duyệt tài liệu.
4. Xin budget inference riêng, thực hiện nếu được phép rồi user nghe nghiệm thu.
5. Chỉ sau đó đặc tả stage 3 templates/composition hoặc bridge nodes.

## 12. Nguồn chính thức và giới hạn

Context7 lookup trong phiên tác giả ngày 2026-10-30 không trả tool khả dụng; không kết luận công cụ luôn vắng mặt. Dùng:

- https://github.com/QwenLM/Qwen3-TTS — local `Qwen3TTSModel`, `generate_custom_voice(text, language, speaker, instruct)` trả waveforms và sample rate; natural-language instruction không là hợp đồng timing chính xác. CPU không được README chứng nhận như demo local.
- https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice — model chính thức, Ryan English, instruction support và license apache-2.0. License không tự cấp quyền cho mọi nội dung/giọng hoặc quyết định monetization.
- Package METADATA/pyvenv.cfg và download manifests local nêu ở mục 2 là bằng chứng phiên bản/provenance; không thay thế hash lại trước inference.

Không dựa vào advertised streaming latency để hứa tốc độ CPU hoặc exact duration. Không cài/upgrade theo tài liệu upstream chỉ để viết spec này.
