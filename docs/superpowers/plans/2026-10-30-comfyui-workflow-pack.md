# ComfyUI Workflow Pack Implementation Plan — giai đoạn 0–1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans according to the user's execution choice. Steps use checkbox (`- [ ]`) syntax for tracking. AGENTS.md overrides test/commit defaults: no test files or test runs; no commit without an explicit request.

**Goal:** Bàn giao một workflow SDXL mở/chỉnh được trong ComfyUI, bản API tương ứng, ba preset và hồ sơ provenance/nghiệm thu trung thực.

**Architecture:** Đóng gói graph 7 node đã sinh ảnh trong demo, không đổi runtime app/worker hoặc production registry. Một graph dùng chung, preset chỉ thay prompt/negative/seed. Frontend round-trip là bằng chứng tương thích UI; generation là bước riêng cần cấp quyền.

**Tech Stack:** ComfyUI snapshot 0.43.2 / frontend 1.57.4; SDXL Base 1.0; JSON/Markdown; Node hiện có để đọc JSON/hash. Repo Next 15.5.28, React 19.1.0, Remotion 4.0.537; không thay dependency.

**Spec:** `docs/superpowers/specs/2026-10-30-comfyui-workflow-pack-design.md` — user duyệt ngày 2026-10-30. User đã duyệt plan và chọn **Native** trong chat ngày 2026-10-30; triển khai inline, một reviewer độc lập cuối. Generation vẫn cần quyền riêng.

## Global Constraints

- Giữ dirty feature checkout; kiểm branch/path trước triển khai, không stash/reset hoặc tạo worktree làm mất các dependency chưa commit. Không thực hiện trên master nếu chưa có quyền riêng.
- Không tạo/sửa/chạy test, fixture hoặc mock. Kiểm artifact bằng đọc JSON, hash, source review và thao tác UI; không thêm test runner hoặc dependency.
- Không commit/push, DB/schema/migration, .env/compose, production registry/flag hoặc production job contract.
- Không tự start/restart/update ComfyUI/app/container; không sửa firewall/listen/tunnel, tải model hoặc cài node.
- Không generation mới từ quyền duyệt spec/plan. Không clear/cancel/interrupt queue. Không gọi paid API.
- Batch 1, một SaveImage, size duy nhất 1024×576; steps 24, CFG 6.5, euler/normal, denoise 1; seed mặc định 730100 với hành vi giữ seed cố định.
- Model `sd_xl_base_1.0.safetensors`, 6,938,078,334 byte; SHA-256 `31e35c80fc4829d14f90153f4c74cd59c90b779f6afe05a74cd6120b893f7e5b`.
- Không sửa/ghi đè demo ảnh, giọng hoặc video cũ. File pack không chứa weights, media, token hoặc absolute path riêng của máy.
- Không thêm script validator/generator hoặc bridge node vào phạm vi plan. Nếu cách export hiện có không đủ, ghi blocked; không âm thầm mở rộng thành code subsystem.

## Review Focus

Không có automated tests theo AGENTS; mỗi điểm được kiểm ở task ghi bên cạnh:

1. Workflow UI nhìn đúng nhưng widget order/seed control làm API export đổi input — Task 3 phải round-trip và so semantic, không chỉ parse JSON.
2. Runtime/model đã thay hoặc không truy cập được — Task 1 phân biệt historical/live, không fallback và không ghi accepted.
3. Hash stale sau save/export hoặc nhầm raw SHA với canonical graph SHA — Task 4 tính lại sau lần chỉnh cuối và phân biệt trường dữ liệu.
4. Hai preset phụ bị hiểu là đã chạy hoặc có selector tự động — Task 2/4 ghi chọn thủ công và trạng thái riêng cho cả ba.
5. Workflow pack bị tự phát hành production hoặc dùng lại quyền generation cũ — Task 4 rà scope; phần generation bị khóa riêng.

## File Map và thứ tự phụ thuộc

Chỉ tạo sáu file tại `workflows/comfy/sdxl-illustration/v1/`:

| File | Trách nhiệm |
|---|---|
| acceptance.md | inventory, lịch sử bằng chứng, trạng thái packaging/UI/ba preset/production |
| presets.json | ba bộ prompt, không phải ba graph |
| workflow-api.json | graph executable không bọc POST request |
| workflow.json | UI graph có bố cục/nhóm/widget |
| manifest.json | model, hashes, bindings, settings, version evidence |
| README.md | cách mở, chọn preset, lưu/export, giới hạn và khôi phục |

Task 1 → Task 2 → Task 3 → Task 4. Nếu frontend không dùng được, vẫn hoàn thành artifact tĩnh trong khả năng đã xác minh; UI giữ pending/blocked. Không coi vòng nghiệm thu runtime bị chặn là lý do xin quyền cài/start tự động.

Nguồn đọc, không sửa: `src/worker/comfy-demo-generate.mjs`, `data/spikes/comfy-video-20261030/{environment,sky-day,sky-sunset,farm-dry,farm-grown,habit-seed,habit-tree}.json`, `src/lib/comfy/{contracts,registry}.ts`, package.json/lockfile.

---

### Task 1: Inventory và hồ sơ nghiệm thu giai đoạn 0

**Files:** Create `workflows/comfy/sdxl-illustration/v1/acceptance.md`.

**Interfaces:** Consumes demo ledgers và runtime chỉ đọc. Produces historical/live evidence, compatibility blockers và các trạng thái ban đầu cho Task 2–4.

- [x] **Step 1 — Xác nhận checkout và quyền.** Chạy `git branch --show-current`, `git status --short`; đọc spec/AGENTS/package/lock. Ghi version và phạm vi file của plan trong ledger thực thi; không chép toàn bộ dirty diff vào pack.
  Expected: feature branch đúng, không mất thay đổi khác; versions là dữ liệu thực tế, không chỉ sao bảng cũ.
- [x] **Step 2 — Đối chiếu bằng chứng demo.** Đọc sáu ledger, xác nhận succeeded, graph 7 node và model/settings như spec. Chọn graph sky-day làm baseline. Ghi nguồn evidence theo relative path, ngày và giới hạn (API graph đã chạy, UI chưa nghiệm thu).
  Expected: 7 node với ID 3–9, không có graph giả hoặc prompt ID được tạo mới.
- [x] **Step 3 — Inventory local không mutation.** Nếu endpoint đang chạy, GET có timeout hữu hạn `/system_stats`, `/object_info/CheckpointLoaderSimple`, `/object_info/CLIPTextEncode`, `/object_info/EmptyLatentImage`, `/object_info/KSampler`, `/object_info/VAEDecode`, `/object_info/SaveImage`, `/queue`; không gửi POST. Xác định file checkpoint bằng dữ liệu cài đặt đã có; kiểm size và SHA-256 bằng công cụ hash local. Hash file không là benchmark.
  Expected: observedAt/version/node/model evidence live hoặc blocked kèm lý do; mismatch model/version không bị che bằng fallback. Không truy cập được thì dùng historical evidence với nhãn rõ, không start dịch vụ.
- [x] **Step 4 — Tạo acceptance.md.** Các phần: inventory historical/live; packaging pending; UI round-trip pending; generation science/pixel-farm/minimal pending chưa có quyền; production not_released; evidence paths; blockers và ngày. Không ghi absolute user path, credential hoặc toàn bộ environment.
  Verification: đọc trực tiếp file và đối chiếu evidence đã thu; trạng thái phải phản ánh đúng thao tác thực tế, không kết luận đầy đủ từ snapshot demo.

### Task 2: API graph và ba preset dùng chung

**Files:** Create `workflow-api.json`, `presets.json` trong thư mục pack.

**Interfaces:** Consumes Task 1 baseline. Produces graph node IDs cố định và preset data cho UI/manifest.

- [x] **Step 1 — Tạo presets.json.** Root `{version:1,defaultPreset:"science",presets:[...]}`. Mỗi mục có `id`, `name`, `purpose`, `positive`, `negative`, `exampleSubject`, `seed`.
  - science: positive từ shot sky-day, seed 730100, chủ thể bầu trời xanh trên đồi.
  - pixel-farm: positive từ shot farm-grown, seed 730103, vườn pixel xanh; không dùng prompt dry như bảo đảm trước/sau.
  - minimal: positive từ shot habit-seed, seed 730104, mầm cây trong chậu, khoảng trống đặt chữ.
  - Negative dùng chuỗi chung từ demo; không thêm chữ/logo vào ảnh. Purpose nêu giới hạn chủ thể/phong cách, không hứa continuity.
  Expected: đúng ba ID `science`, `pixel-farm`, `minimal`; không model/steps riêng, không URL/path/script thực thi trong preset.
- [x] **Step 2 — Tạo workflow-api.json.** Clone graph sky-day, giữ kết nối, settings và model; positive/negative/seed lấy science, prefix đổi thành `cartoon_workflow_sdxl_v1`. Không đưa ledger state/client_id/prompt_id vào graph. Không thêm `_meta` nếu không cần.
  Bindings: `6.text`, `7.text`, `3.seed`, `5.width`, `5.height`, `5.batch_size`, `9.filename_prefix`; output 9. Giữ model/CLIP/VAE links đúng baseline.
- [x] **Step 3 — Kiểm artifact bằng Node inline, không tạo file test.** JSON.parse cả hai; liệt kê IDs/class_type/inputs, đối chiếu từng link với baseline; xác nhận 7 node, model/size/batch/sampler/settings, science bằng default inputs, prefix tương đối an toàn và một SaveImage. Đọc nội dung cả ba preset.
  Expected: khác baseline chỉ ở prefix mặc định và metadata không thực thi nếu có; không bỏ qua bất kỳ input thay đổi nào để cho phép so sánh qua.

### Task 3: Workflow giao diện và vòng save/export không sinh ảnh

**Files:** Create `workflow.json`; update `workflow-api.json` chỉ khi cần thống nhất export, update `acceptance.md`.

**Interfaces:** Consumes Task 2 graph/preset. Produces UI graph và evidence export API có semantic tương ứng, hoặc trạng thái pending/blocked có căn cứ.

- [x] **Step 1 — Xác minh cách export trên bản thực tế.** Đọc tài liệu chính thức được dẫn cuối plan và object_info/serializer đang cài. Dùng công cụ browser tương tác nếu có thể mở frontend local đang chạy; nếu không, chuẩn bị hướng dẫn người dùng thao tác và ghi pending. Không cài browser/node, tự khởi động Comfy hoặc sửa cấu hình để vượt blocker.
- [x] **Step 2 — Tạo bố cục UI từ graph thực.** Load graph API vào một workflow/tab riêng; không ghi đè graph đang mở của người dùng. Giữ model, seed 730100 và chế độ seed fixed; nhóm metadata: Model, Prompts, Sampling, Output. Sắp xếp trái sang phải, prompt có diện tích đọc được, không đè dây/node. Dùng title/group metadata, không thêm custom/executable node.
  Lưu bản UI vào workflow.json bằng format frontend hỗ trợ. Nếu không tương tác được frontend, chỉ dựng bản candidate dựa trên schema/serializer đã kiểm, ghi rõ unverified; không đoán widget order rồi đánh dấu đạt. Nếu thiếu đủ dữ liệu serializer, dừng artifact UI ở blocked thay vì tạo file giả.
- [x] **Step 3 — Round-trip không Run.** Mở workflow.json → kiểm model/seed control/settings/link → save → mở lại → Export Workflow (API). Lưu export bằng chứng ở thư mục mới `data/spikes/comfy-workflow-pack-20261030/`, chỉ tạo nếu chưa có hoặc chọn suffix mới, không overwrite evidence cũ.
  Expected: UI không báo thiếu node, bố cục và fixed seed giữ nguyên; không POST /prompt hoặc bấm Run. Khi chỉ có người dùng có thể thao tác, pending cho tới nhận evidence thực tế; không tự xác nhận thay người dùng.
- [x] **Step 4 — So semantic export với API bàn giao.** JSON.parse, chỉ loại `_meta` (title/layout không thực thi) trước so sánh; sort object keys đệ quy, giữ array order. So node IDs, class_type và toàn bộ inputs/links chính xác. Không bỏ seed/prefix vì tiện so sánh. Nếu mismatch, truy nguyên widget/link/config rồi sửa nguồn và thực hiện lại vòng save/export; không sửa API để âm thầm đổi fixed settings.
  Expected: semantic match hoặc blocker ghi cụ thể. Ghi phiên bản quan sát, schema format thực export, thời điểm, evidence paths và hash export vào acceptance.md. Không yêu cầu pixel-identical vì chưa generation.

### Task 4: Manifest, hướng dẫn và bàn giao có giới hạn

**Files:** Create `manifest.json`, `README.md`; finalize `acceptance.md`.

**Interfaces:** Consumes artifacts cuối Task 2–3 và evidence Task 1. Produces pack tự giải thích được, không đăng ký production.

- [x] **Step 1 — Viết README.md.** Hướng dẫn mở File → Load, chọn model, dán prompt/negative của preset và seed tương ứng, giữ seed fixed, kiểm size/batch, save UI và Export Workflow (API). Nêu default là science, không có dropdown preset tự động. Có nguồn model/license; không bảo đảm commercial clearance, nhân vật/địa điểm nhất quán hoặc ảnh là bằng chứng khoa học. Không gọi workflow này là full video pipeline. Nêu cách xử lý thiếu model/node/version mismatch: dừng, không fallback/download.
- [x] **Step 2 — Tạo manifest pack version 1.** Trường:
  - `version:1`, `id:"sdxl-illustration"`, `revision:"v1"`.
  - `artifacts`: raw SHA-256 cho workflow.json, workflow-api.json, presets.json nếu file tồn tại; thiếu workflow UI phải ghi blocker, không bịa hash. Pack chưa đủ sáu file không thể đánh dấu packaging complete.
  - `apiCanonicalSha256`: hash sort đệ quy keys của graph API đầy đủ, giữ arrays. Đây khác semantic comparison bỏ `_meta` ở Task 3 và khác raw file SHA.
  - `model`: filename, bytes, sha256, source, licenseNote đúng spec; không absolute path.
  - `bindings`, `outputNode:"9"`, `defaultSize:{width:1024,height:576}`, `allowedSizes:[{width:1024,height:576}]`, fixed settings và default seed theo Global Constraints.
  - `compatibility`: historical snapshot và live observed versions/date tách biệt, UI format thực tế hoặc null nếu blocked.
  - `acceptance`: packaging/static/UI và generation theo từng preset; production `not_released`. Status values dùng `pending`, `passed`, `blocked`, cùng evidence/reason; production riêng không phải boolean execution flag.
  Không hash manifest vào chính nó; không import manifest vào registry.
- [x] **Step 3 — Kiểm cuối không test.** Đọc/parse các JSON; tính lại raw/canonical hashes từ file cuối bằng Node `node:crypto`/`node:fs`, đối chiếu manifest. Kiểm liên kết graph/default preset/settings/bindings; scan nội dung pack cho secrets/path riêng, model weights/media và hướng dẫn có side effect ngoài quyền. Chạy whitespace check từng file mới bằng `git diff --no-index --check -- /dev/null <file>` trong Bash hoặc tương đương, và `git diff --check` cho file tracked đã thay đổi. Không cần build/typecheck vì không đổi app code/dependencies; báo rõ không chạy thay vì ngụ ý đã pass.
  Expected: hash khớp; đủ artifact mới được packaging passed; UI/generation pending không bị nâng thành passed. Không dùng việc checksum đúng làm bằng chứng UI hoạt động.
- [x] **Step 4 — Review theo phương thức user chọn.** Review đúng sáu artifact/spec/plan và scope, không quét cả dirty branch không liên quan. Reviewer không chạy test hoặc generation. Xử lý lỗi quan trọng bằng chỉnh artifact rồi kiểm lại hash/semantic tương ứng; ghi minors/deviations vào ledger. Nếu có đổi file sau hash thì tính lại trước bàn giao.
- [x] **Step 5 — Bàn giao.** Liên kết workflow UI/API/presets/README, nêu versions và evidence. Báo riêng: stage0, packaging/static, UI round-trip, ba preset generation, production. Nếu chưa đủ quyền hoặc không dùng được frontend thì nêu pending/blocked rõ; không tuyên bố giai đoạn1 nghiệm thu hoàn toàn. Không commit/push.

## Cổng runtime riêng — không thực thi từ duyệt plan

Đề xuất xin quyền sau đóng gói: **tối đa 3 ảnh, mỗi preset một ảnh, tuần tự, batch 1**, không model/node mới hoặc start dịch vụ. Nếu user chỉ cấp một ảnh, chỉ nghiệm thu preset được chọn. Không tự bổ sung lượt khi ảnh chưa đạt.

Khi được cấp quyền: GET preflight/queue; kiểm đúng model/hash và pack; prefix riêng từng lượt; ghi graph/trạng thái trước POST; lưu prompt ID; theo dõi cùng ID khi gián đoạn, không resubmit mù quáng. Tái sử dụng quy trình durable demo đã đọc nếu phù hợp, không viết runner/contract mới trong phạm vi pack. Nếu runner cũ hard-code sáu shots không dùng được thì thực hiện thủ công qua UI đã kiểm và ghi evidence; không chạy script cũ để vô tình sinh sáu ảnh.

Output chỉ từ node 9, PNG 1024×576, tối đa 25 MiB/16 triệu pixel, giải mã được. Giữ graph thực/preset/seed/settings/version/prompt ID/hash ảnh trong thư mục evidence mới. User duyệt trực quan trước khi ghi nội dung đạt. Cập nhật acceptance/manifest; graph/preset đổi thì cập nhật hash và hạ trạng thái evidence không còn tương ứng. Không thu gom model/image vào repo pack.

## Self-review của plan

- Spec 1–3/8: Task 1 và bàn giao Task 4; scope riêng, giữ checkout và production disabled/unreleased.
- Spec 4–5: Task 2/3/4; sáu artifact, bảy node, ba preset, fixed settings/bindings/provenance.
- Spec 6: Task 3; phân biệt structure, UI round-trip và generation, hash semantic/raw riêng.
- Spec 7: cổng runtime khóa theo quyền riêng, không chạy từ approval tài liệu.
- Spec 9–10: duyệt spec đã có; plan đã duyệt Native; nguồn chính thức và no-test được giữ.
- Phụ thuộc: Task 2 tạo default science; Task 3 giữ nguyên inputs; Task 4 chỉ hash sau export cuối. Nếu frontend blocked thì không làm giả chứng cứ để đóng stage1.

## Nguồn chính thống và handoff

Context7 không có tool khả dụng khi tra trong phiên; tài liệu ComfyUI chính thức đã đối chiếu:

- https://docs.comfy.org/development/api-development/workflow-api-format.md
- https://docs.comfy.org/specs/workflow_json.md
- https://docs.comfy.org/development/comfyui-server/comms_routes
- https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0

Chọn format theo frontend thực tế; schema version không suy từ frontend version.

**Khuyến nghị Native:** bốn task phụ thuộc liên tiếp, chủ yếu JSON/Markdown và UI round-trip; làm inline giảm chi phí handoff, có một lượt review độc lập cuối. Subagent-driven vẫn là lựa chọn nếu user muốn review từng task. Phương thức Native từng chọn cho pilot khác không tự áp dụng cho plan này.
