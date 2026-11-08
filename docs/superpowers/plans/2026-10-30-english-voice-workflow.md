# English Voice Workflow Implementation Plan — giai đoạn 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans according to the user's execution choice. Steps use checkbox (`- [x]`) syntax for tracking. AGENTS.md overrides TDD/commit defaults: no test files, fixtures, mocks or test runs; no commit without explicit request.

**Goal:** Xây công cụ local tái sử dụng Qwen Ryan để tạo WAV từng cue có fingerprint/cache/resume và timeline chính xác, không nối production.

**Architecture:** Python CLI ngoài ComfyUI; validation thuần không import model, preflight chỉ đọc/hash, run có opt-in và budget riêng. Cache immutable attempts + commit record, run snapshot/ledger và manifest/timeline cuối. Không sửa demo cũ hoặc renderer.

**Tech Stack:** Python 3.12.10; qwen-tts 0.1.1, transformers 4.57.3, torch 2.15.0+cpu, torchaudio 2.11.1+cpu, numpy 2.5.4, soundfile 0.14.0; model Qwen3-TTS-12Hz-1.7B-CustomVoice. Repo Next 15.5.28, React 19.1.0, Remotion 4.0.537, TypeScript 5.9.3. Không thêm dependency.

**Spec:** `docs/superpowers/specs/2026-10-30-english-voice-workflow-design.md` — user duyệt written spec ngày 2026-10-30. User đã duyệt plan bằng lựa chọn “native” ngày 2026-10-30; triển khai inline và một review độc lập cuối, không inference từ approval tài liệu.

## Global Constraints

- Giữ dirty feature checkout `feat/mode-switch`; xác nhận branch/path, không stash/reset hoặc tạo checkout làm mất dependency chưa commit; không sửa ngoài scope.
- Không tạo/sửa/chạy test, fixture/mock, không cài runner/dependency. Kiểm bằng source review, compile trong memory, CLI validation/preflight và artifact inspection; ghi rõ nhánh runtime chưa exercise.
- Không generation mới, benchmark, tải/cài model/node/package, service startup/restart, paid API, HTTP/Comfy integration, render/upload hoặc test phá hỏng artifact.
- Không DB/schema/migration, .env/compose/registry/flags/tunnel, commit/push; không đổi demo và pack ảnh.
- Model repo `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice`, revision `0c0e3051f131929182e2c023b9537f8b1c68adfe`; English/Ryan duy nhất, CPU float32/SDPA, 6 compute/2 interop threads.
- Main weight 3,833,402,552 byte, SHA256 `38b1d5971bdbd982b561cccec982669a53b0537c3cf5e9bd4778ed07bb2f5137`; speech tokenizer weight 682,293,092 byte, SHA256 `836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258`.
- Input version1, request/cue IDs ASCII `[A-Za-z0-9_-]{1,64}`, English/Ryan, fps30; 1–24 cue; text1–400 Unicode code points/≤60 whitespace words, override instruction1–500, seed integer0–2^32−1. Reject bool-as-int, unknown/duplicate JSON keys and nonfinite numbers. Chỉ normalize line endings.
- WAV PCM16 mono, returned sample rate8,000–192,000, finite/nonempty, source abs peak0.001–1, duration≥1 và <33s; không normalize/resample/trim/time-stretch. Listening pending độc lập.
- Timeline30fps, lead6/tail15 frames; audioFrames=ceil(samples*30/rate), audioEnd exclusive; không word timestamps.
- Python `-I`, scripts ngoài model/download; no remote code, URL model, fallback/device/model changes. Data/evidence local gitignored, không chứa weights/media trong pack.

## Review Focus

Không automated tests theo AGENTS; source/artifact checks ở task được chỉ rõ thay thế, không tuyên bố runtime đã được exercise:

1. Cache sai khi model/config/default generation hoặc code/runtime đổi: Task2/4 phải hash inventory và đối chiếu effective settings, không chỉ text/tone.
2. Crash giữa WAV/metadata/commit, lock cũ hoặc hai tiến trình: Task3/4 commit-last/single-writer, ambiguous không auto retry; crash/concurrency exercise giữ unverified.
3. Validation/preflight vô tình load model, gọi network hoặc run không opt-in/budget: Task1/4 tách imports và command dispatch, kiểm CLI mặc định thực tế không inference.
4. Symlink/junction/path escape, root nhầm hoặc requestId trùng nội dung khác: Task3/4 kiểm từng thành phần và immutable snapshot; không ghi vào demo cũ.
5. Nhầm kỹ thuật thành nghe đạt hoặc timeline dùng rate/word timing giả: Task4/5 chỉ sample-derived timeline, acceptance riêng; PCM quantization không bị bỏ qua khi kiểm clip.

## File map và interfaces chung

Chỉ tạo:

| File | Trách nhiệm |
|---|---|
| `scripts/english_voice.py` | entrypoint `-I`, dispatch CLI, lazy backend import |
| `scripts/english_voice/contract.py` | strict JSON/request/preset validation, canonical hash, effective cue |
| `scripts/english_voice/provenance.py` | model/runtime/code inventory, pinned settings/fingerprint context |
| `scripts/english_voice/store.py` | safe paths/root marker/lock, attempts/commit/ledger/run publish |
| `scripts/english_voice/audio.py` | WAV validation/metrics và timeline, lazy numpy/soundfile |
| `scripts/english_voice/backend.py` | Qwen load/generate, lazy heavyweight imports |
| `scripts/english_voice/__init__.py` | package marker, không side effects |
| `workflows/voice/qwen-english/v1/presets.json` | ba instruction nguyên văn spec, version1 |
| `workflows/voice/qwen-english/v1/request.example.json` | nội dung dùng thật để operator chỉnh/duyệt, không fixture/test; ba cue |
| `workflows/voice/qwen-english/v1/manifest.json` | model inventory/settings/code+pack hashes/acceptance summary |
| `workflows/voice/qwen-english/v1/README.md` | CLI/preflight/run/resume/manual recovery và giới hạn |
| `workflows/voice/qwen-english/v1/acceptance.md` | evidence static/preflight/inference/listening/production tách riêng |

`english_voice.py` cùng basename package: entrypoint không import `english_voice` trước khi resolve trusted sibling package; bootstrap `sys.path` chỉ thêm thư mục scripts đã xác minh sau khi Python -I khởi động, không thêm model/cwd. Các module import package tuyệt đối. Không đặt code trong data hoặc sửa package installed.

CLI (các path đều argument, không hard-code user path):

- `PYTHON -I scripts/english_voice.py --request REQUEST` (không subcommand) tương đương `validate --request REQUEST`; stdout report, không ghi output/load model.
- `... validate --request REQUEST`: strict parse, effective cue/preset; không cần model/output.
- `... preflight --request REQUEST --model MODEL`: validate + read/hash model/runtime/code + fingerprints; stdout JSON, không model import/load/inference, không ghi output.
- `... verify --output ROOT --request-id ID`: root phải tồn tại, read-only kiểm snapshot/ledger/commit/WAV/timeline; không inference hoặc tạo/sửa file. Nếu lock đang có thì dừng để không đọc snapshot đang đổi.
- `... run --request REQUEST --model MODEL --output ROOT --execute --max-new-cues N [--retry-cue ID ...]`: N integer0–24; thiếu execute/N thì từ chối trước mutation/model import. N0 chỉ recovery/cache-linking, không load model; cùng lệnh với requestId cũ là resume. Retry chỉ cue failed/needs_review theo yêu cầu tường minh, giữ attempts cũ; không tự tháo stale root lock.

Exit codes:0 thành công,2 input/preflight/CLI mismatch,3 needs_review/lock/partial or corrupt artifact,4 budget hết còn cue pending,5 backend/runtime failure. Không in traceback chứa secret; lỗi hành động cụ thể, log local paths chỉ khi operator cần, pack không có absolute user path.

## Task 1: Contract, presets và validation-only CLI

**Files:** entrypoint, package marker, contract.py, presets.json, request.example.json.

**Interfaces:** `load_request(path: Path) -> dict`, `load_presets(path: Path) -> dict`, `resolve_cues(request: dict, presets: dict) -> list[dict]`, `canonical_bytes(value) -> bytes`, `digest(value) -> str`. Effective cue giữ original/effectiveText/effectiveInstruction/presetId/presetVersion/instructionSource/seed/id. Canonical Python JSON UTF8 ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False; không float đặc biệt.

- [x] **Step1 — Preflight workspace.** Đọc AGENTS/spec/plan, git branch/status, kiểm package/lock/env metadata thực tế; tạo execution ledger theo skill, không install/test/stash. Expected: feature checkout, baseline/deviations ghi rõ.
- [x] **Step2 — Presets và example.** Copy đúng ba ID/instruction spec. Example requestId `english-voice-pilot-v1`, English/Ryan/fps30, ba cue hook/explainer/story riêng, mỗi cue20–40 từ, tổng≤120 từ và≤400 code points/cue; seeds731100/731101/731102. Không lấy clip demo làm evidence cho example này; chưa chạy. Đây là tài liệu đầu vào sử dụng thật, không dữ liệu test.
- [x] **Step3 — Strict parser và limits.** Bắt duplicate keys bằng object_pairs_hook, reject constants, exact root/cue keysets/types; ID regex fullmatch; preset/override resolution theo spec; normalize CRLF/CR trên effective strings, không strip lời đọc. Không nhận settings/path trong request. Canonical hash effective data không chứa ID/thứ tự khi tính waveform sau này.
- [x] **Step4 — CLI validation mặc định.** Bootstrap trusted package, argparse dispatch với validate là default; help không import backend. Required flags run được kiểm trước output mutation. Expected: không qwen/torch imports top-level hoặc model load trong contract/entrypoint.
- [x] **Step5 — Kiểm không inference.** `PYTHON -I scripts/english_voice.py --help` và `PYTHON -I scripts/english_voice.py --request workflows/voice/qwen-english/v1/request.example.json`. Expected: exit0, ba effective cues/English/Ryan/settings boundaries, không output root/audio. Compile source bằng `compile(read_text(), file, 'exec')` trong memory, không py_compile cache. Source review cả limits/errors/duplicate keys; không tạo case file hoặc test script.

## Task 2: Provenance, model release inventory và fingerprint

**Files:** provenance.py, manifest.json; contract digest tái sử dụng.

**Interfaces:** `collect_context(model_dir: Path, release: dict) -> dict`, `fingerprint(cue: dict, context: dict) -> str`. Context tách `identity` JSON khỏi local diagnostics; fingerprint=`digest({version:1,cue:<effective identity>,context:context.identity})`.

- [x] **Step1 — Pin release inventory.** Đọc download manifest hiện hữu và model local; giữ repo/revision/license và danh sách file chính xác. Với LFS so size/SHA256 đã ghi; file Git nhỏ so `SHA1('blob '+len+'\0'+bytes)` với upstream oid manifest, sau đó ghi SHA256 từng file vào pack manifest. Xác nhận metadata upstream revision khi cần qua nguồn chính thức, không download weights. Hash file streaming, regular files, no symlink/junction/unexpected executable files; bỏ cache download metadata khỏi bundle inventory, không bỏ config/tokenizer thực thi. Mismatch dừng, không sửa pin để cho qua.
- [x] **Step2 — Pin effective settings rõ ràng.** Từ source installed `_merge_generate_kwargs` và generation_config.json đã đọc: `do_sample:true,top_k:50,top_p:0.9,temperature:0.8,repetition_penalty:1.05,subtalker_dosample:true,subtalker_top_k:50,subtalker_top_p:1.0,subtalker_temperature:0.9,max_new_tokens:420,non_streaming_mode:true`. Không thêm kwargs caller tự do. Hash cả generation config và installed wrapper source để default implementation đổi làm identity đổi. Backend sẽ so effective merged dictionary đúng pin trước generate; không gọi private method ở preflight bằng cách instantiate fake model.
- [x] **Step3 — Runtime/code identity.** importlib.metadata inventory sorted name/version toàn venv, digest; Python implementation/version, OS release/machine/processor, device/dtype/attention/threads; hash entrypoint và sáu module package thực thi theo relative path. Không hash manifest tự nó hoặc absolute paths. Không import torch/Qwen ở preflight; metadata/source chỉ đọc. Thiếu package/source hoặc baseline version khác phải báo mismatch, không upgrade. Canonical identity lưu structured settings cùng bundle/runtime/code digests.
- [x] **Step4 — CLI preflight.** Validate trước, kiểm model local absolute-resolved path, chính xác release inventory/hash, in context/fingerprints không ghi artifact/load model. Cache pin trong memory của invocation, không dùng timestamp-only cache thay hash. Expected: 3 fingerprints hex64, pinned revision/settings/runtime evidence, không inference. Hash lại trước actual run, model inventory phải ổn định trong execution; không hỗ trợ model file bị bên khác sửa đồng thời.
- [x] **Step5 — Kiểm không inference.** `PYTHON -I scripts/english_voice.py preflight --request workflows/voice/qwen-english/v1/request.example.json --model <EXISTING_MODEL>`; lưu stdout evidence chỉ trong workspace của plan nếu cần, không redirect ra artifact pack chứa path riêng. Expected: exit0 hoặc blocker đúng sự thật, đủ hash/identity. Source review identity phủ các field spec, bool/int/float canonical, đổi index/padding không thuộc waveform. Không tự sửa model hoặc tạo input giả để exercise mismatch.

## Task 3: Store an toàn, single writer và commit-last

**Files:** store.py.

**Interfaces:** `open_root(path: Path, create: bool) -> Path`, `locked(root: Path)` context manager, `bind_run(root, request: dict, request_hash: str) -> Path`, `inspect_clip(root, fingerprint, expected_identity) -> dict | None`, `begin_attempt(root, fingerprint, identity, retry: bool) -> dict`, `commit_clip(root, attempt, audio_metadata: dict) -> dict`, `publish_run(root, run_id, manifest: dict, timeline: dict) -> None`. inspect_clip gọi audio inspector Task4 qua lazy import; Không model load.

- [x] **Step1 — Root/path ownership.** Chỉ create root mới/rỗng và marker `{version:1,kind:'qwen-english-voice',id:<uuid>}` bằng exclusive create. Root nonempty không marker từ chối; reject model tree/repo code/old demo root làm output; không tạo marker vào root lạ. Kiểm từng existing ancestor/component với lstat/is_symlink/is_junction/resolve; output components phải ở root/regular file; không follow reparse path ra ngoài. Đây local trusted-user filesystem, không quảng cáo chống adversarial TOCTOU/multi-user service.
- [x] **Step2 — Root lock.** `.runner.lock` O_CREAT|O_EXCL, chứa token/PID/time, flush/fsync; release chỉ khi token còn đúng và invocation sở hữu, normal exceptions dùng finally. Tồn tại thì exit3, không auto steal/deletion/retry theo tuổi. Không thêm CLI unlock tự động. README hướng dẫn đối soát tiến trình trước khi xin phép xử lý stale lock riêng.
- [x] **Step3 — Snapshot/ledger.** runs/ID/request.json giữ nguyên input đã parse và hash canonical original; cùng ID/hash khác từ chối trước mutation. ledger ghi atomic temp+flush/fsync+replace, có schemaVersion/requestHash/cueId/fingerprint/state/attemptId/error. Updates expected request hash; không overwrite immutable snapshots. Record generating trước model call. Làm rõ rename là commit boundary đơn-file, không guarantee powerloss transaction nhiều file.
- [x] **Step4 — Attempts và commit.** cache/FP/attempts/UUID chứa immutable effective identity, state và audio.wav/metadata.json. Chỉ attempt mới cho fresh pending hoặc explicit retry cue; không overwrite attempt cũ. Commit cache/FP/commit.json publish cuối từ temp cùng dir, tham chiếu attempt/audioHash/metadataHash/identityDigest; file đã commit hợp lệ không bị thay bằng clip mới. Orphan/failed cần review; explicit retry giữ artifacts, chỉ cho khi không có successful commit và không stale lock. commit có nhưng ledger stale thì verify/relink, không generate. Metadata hash gắn WAV, kiểm regular/size/hash/decode trước return hit. Exact waveform fingerprint duplicate trong cùng request chia sẻ commit hợp lệ, không sinh hai lần.
- [x] **Step5 — Run publish.** manifest/timeline vào immutable publish attempt, commit `runs/ID/complete.json` cuối cùng với hash cả hai/requestHash; verify đọc chỉ theo commit. Không overwrite manifest hoàn chỉnh hoặc bỏ cue lỗi. Ledger có thể partial, complete chỉ khi tất cả ready và references được kiểm lại. Unknown/crash/inconsistent state exit3, không tự coi file tồn tại là ready.
- [x] **Step6 — Kiểm source/compile.** Compile memory; lần theo từng write/path/lock release/commit và crash boundary theo source, ghi bảng branch và trạng thái evidence. Chưa có run mới nên cache/concurrency/crash/corruption thực tế **unverified**, không dựng fixture hoặc cố gây lỗi để tuyên bố kiểm xong. Review Focus2/4 bắt buộc reviewer đọc.

## Task 4: Backend, WAV/timeline và orchestration hữu hạn

**Files:** backend.py, audio.py, entrypoint, store integration.

**Interfaces:** `load_backend(model_dir: Path, context: dict) -> object`, `generate_cue(backend, cue: dict, context: dict) -> tuple[waveform,int]`; `write_checked_wav(path, waveform, sample_rate) -> dict`, `inspect_wav(path: Path) -> dict`, `build_timeline(cues: list[dict], fps: int=30) -> dict`. Không import model từ audio/store/contract.

- [x] **Step1 — Offline backend lazy.** Trước heavyweight imports set HF_HUB_OFFLINE/TRANSFORMERS_OFFLINE=1; existing validated local directory only; `from_pretrained(local_files_only=True,device_map='cpu',dtype=torch.float32,attn_implementation='sdpa')`; không trust_remote_code. Wrapper 0.1.1 tự load processor/tokenizer, nên kiểm nguồn/hash và offline env trước wrapper, không chỉ dựa một flag truyền xuống model. Set threads một lần lúc load, inspect custom_voice/1.7B/English/Ryan và runtime actual đúng context. So `_merge_generate_kwargs` với pin; unexpected kwargs/default mismatch dừng trước inference.
- [x] **Step2 — Sinh một cue.** torch.manual_seed(cue.seed) ngay trước generate_custom_voice với effectiveText/instruction, pin args; đúng một waveform và returned integer rate. Không auto retry exception/invalid audio, mark failed hoặc needs_review theo lỗi. Budget tiêu ngay khi ghi generating và bắt đầu attempt model call, không sau khi thành công; lỗi vẫn tiêu lượt. Không chạy bước này khi triển khai từ plan approval.
- [x] **Step3 — Audio integrity.** numpy/soundfile lazy; source shape1D mono, finite, rate/peak/duration theo spec; ghi WAV format WAV subtype PCM_16 tạm, flush/fsync file, decode lại kiểm samples/rate/channels/subtype/finite, tính SHA256/bytes/peak/RMS/số sample ở PCM rails. Phân biệt metrics trước/sau quantization, threshold không silently clamp input. Lưu `listening:'pending'`, không speech-match claim. Lỗi giữ attempt diagnostics, không publish commit.
- [x] **Step4 — Timeline.** Integer ceil `(samples*30+rate-1)//rate`; các field cueId/fingerprint/src/wavSha256/sampleRate/sampleCount/text/effectiveInstruction/from/audioFrames/audioStartFrame/audioEndFrame/durationInFrames, root version1/requestId/requestHash/fps30/durationInFrames/cues. Run manifest có provenance/cache refs và trạng thái `technical:'ready',listening:'pending',production:'not_released'`. src root-relative POSIX, không URLs/absolute path.
- [x] **Step5 — Run dispatch.** Validate flags/input/preflight trước mutation; lock root rồi bind immutable run. Duyệt request order, verify cache/commit, reconcile ledger; N0 không load backend. Khi cần fresh generate kiểm ngân sách rồi begin_attempt, lazy load một backend cho run và generate từng cue; backend load failure ghi failure rõ, không fallback. Needs_review không retry trừ explicit retry-cue, stale lock luôn chặn. Dừng khi lỗi/budget hết, giữ partial; chỉ publish khi tất cả ready. No mode nào dùng inference để repair verify/preflight.
- [x] **Step6 — Verify read-only.** Kiểm root marker/lock/snapshot hash/identity/commits/WAV, timeline rebuild từ committed samples và so published timeline; no root creation, writes, backend import/load. Chưa có run hợp lệ từ tool mới thì báo chưa có runtime evidence, không dùng demo clip không fingerprint mới để chứng nhận.
- [x] **Step7 — Kiểm không inference.** Compile memory toàn module; chạy lại --help, default validate và preflight trên example/model thực, ghi exit code/output. Source trace các gates execute/N/retry/N0/no implicit repair; không gọi `run`, tạo orphan/cache giả hoặc synthesize audio. Không tuyên bố generate/resume/crash branches đã chạy.

## Task 5: Tài liệu, acceptance và một review cuối

**Files:** README.md, acceptance.md, manifest.json; approved spec status nếu cần.

- [x] **Step1 — Hướng dẫn chính xác.** Các lệnh CLI từ interface chung, giải thích Python -I/bootstrap, existing venv/model local, root mới, không model download. validate/preflight/verify không inference; `run --execute --max-new-cues 3` chỉ là ví dụ **chưa được phép chạy**. N0/retry flags không thay user permission, không tự unlock/overwrite. Nêu schema/timeline không trực tiếp phù hợp renderer demo cũ, stage3 adapter riêng.
- [x] **Step2 — Manifest/acceptance.** Hash raw code/preset/example sau chỉnh cuối, model inventory+effective settings+versions; không self-hash manifest. Evidence local gitignored không đi cùng clone. Trạng thái static/CLI validation/model inventory theo kết quả thật; new inference3preset/listening/cache-reuse/concurrency/crash phục hồi pending/unverified; production not_released. Không gán human accepted từ command exit0.
- [x] **Step3 — Final checks.** Compile memory, parse JSON/hash manifests và đọc no-inference CLI output, scan pack secrets/absolute paths, `git diff --check` và whitespace new files. Không test. Không npm lint/tsc/build vì Python/JSON/docs không đổi app; nêu rõ skip. Không compile/import từ model directory.
- [x] **Step4 — Independent review.** Scope chỉ file plan này và spec/evidence liên quan, không toàn dirty branch. Theo method user chọn; Native một reviewer cuối với model chọn tường minh từ catalog, read-only, không tests/inference/installs. Dùng Review Focus5 điểm ở trên; reviewer phân biệt source proof với runtime unverified. Fix lỗi quan trọng một pass, kiểm artifact/source/compile lại; không TDD trái AGENTS, không tự chạy inference để verify fix.
- [x] **Step5 — Handoff.** Link CLI/presets/example/README/acceptance, báo raw/static/preflight evidence và runtime chưa chạy. Không commit/push. Chỉ hỏi quyền pilot3cue sau khi bàn giao implementation, không thực thi từ duyệt plan.

## Kết quả thực thi Native

Năm task implementation đã hoàn tất ở mức source/artifact; `--help`, real-example validation, memory compile và model preflight exit0. Một review độc lập hoàn tất; lỗi Important đã sửa trong một pass, các minor còn lại ghi ở acceptance/ledger. Không inference/run/test/commit. Runtime backend/cache/recovery/listening vẫn chưa nghiệm thu. Output root sau review phải nằm ngoài repository và DATA_DIR để không bị route app phục vụ; diagnostics audio bị từ chối giữ nguồn numeric dạng .npy không pickle, không xuất thành clip ready. Checkbox không có nghĩa các nhánh runtime đã được chạy.

## Cổng pilot riêng — chưa được cấp quyền

Đề xuất tối đa3cue mới/3preset,20–40 từ/cue,tổng≤120 từ, tuần tự, Ryan/model hiện có. User phải duyệt request text và budget trước; không tự đổi lời khi bắt đầu chạy. Tối đa3attempt inference, không replacements. Ghi local artifacts/metrics; user nghe từng WAV. Resume cache hit nếu được phép kiểm không inference, không gọi model khi thiếu/corrupt. Mọi exercise crash/concurrency/retry/generation bổ sung là scope/quyền riêng, không masquerade thành static verification.

## Self-review coverage

- Spec1–4: Task1/File map/CLI và giới hạn; tool ngoài Comfy/app, demo nguyên vẹn.
- Spec5–7: Task1/2 strict contracts, exact presets/settings, fingerprints/provenance đầy đủ, không private model giả cho preflight.
- Spec8: Task3 và Task4 run/verify; immutable attempts, lock, request ownership, commit-last, errors/manual recovery. Unexercised states explicitly recorded.
- Spec9: Task4 WAV quantization/integrity và integer timeline, no renderer/SRT.
- Spec10–12: Task5 + pilot gate; no-test/no-inference approval boundaries, separate listening/production and sources.
- Dependencies: contract→context/fingerprint→store→backend/orchestration→docs. No missing shared names; `inspect_clip` audio lazy avoids model imports; code hash excludes manifest self-reference.

## Nguồn đã đối chiếu khi lập plan

Context7 lookup tác giả ngày2026-10-30 không có tool khả dụng. Dùng nguồn chính thức và source cài thực tế:

- https://github.com/QwenLM/Qwen3-TTS — local wrapper/CustomVoice/English/Ryan/instruct/wavs+sr.
- https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice — release/license; pinned local download manifest trong spec.
- https://docs.python.org/3.12/library/os.html — exclusive create/fsync/replace; không gọi rename là multi-file powerloss transaction.
- https://docs.python.org/3.12/library/pathlib.html — is_junction (3.12), is_symlink/resolve; không tuyên bố chống mọi concurrent filesystem attack.
- Installed `qwen_tts/inference/qwen3_tts_model.py`: from_pretrained83–121, merge287–352, custom_voice732–839; model `generation_config.json` top_k/repetition/subtalker defaults. Metadata/versions xác minh khi viết spec, implementation đọc lại trước dựa vào.

**Handoff:** khuyến nghị **Native** vì năm task có interface phụ thuộc chặt, một tool local, không runtime inference trong phạm vi duyệt plan; một reviewer độc lập cuối kiểm gates/durability. Subagent-driven phù hợp nếu muốn review từng task và chấp nhận thêm chi phí. User đã chọn Native cho stage2. Ledger: `.superpowers/sdd/2026-10-30-english-voice-workflow/progress.md`; không inference từ lựa chọn này.
