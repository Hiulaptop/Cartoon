# ComfyUI asset pilot — foundation, chưa nghiệm thu runtime

## Phạm vi hiện tại

App điều phối yêu cầu/trạng thái/duyệt; ComfyUI thực thi một workflow ảnh local đã phát hành. Chỉ áp dụng biến thể của asset **đã tồn tại**, bao gồm base chưa được duyệt khi failed/rejected. Tạo asset mới/casting/algorithm tự động vẫn dùng 9router. Thiếu backend ở payload/form cũ vẫn là 9router; không tự fallback khi chọn ComfyUI.

Ngày 2026-10-30: registry đang rỗng, `COMFYUI_ENABLED=false` mặc định. Chưa có API graph/model được bàn giao, chưa chạy sinh ảnh hoặc đo hiệu năng. Đây không phải chứng nhận production hay kết quả video hoàn chỉnh.

Repo hiện dùng Next 15.5.28, React 19.1.0, Drizzle ORM 0.45.4 / Kit 0.31.11, Zod 4.6.7, sharp 0.35.5, pg 8.23.1 (đối chiếu lockfile). Không thêm dependency cho adapter.

## Cấu hình

Biến phía server trong `.env.example` và compose runtime anchor:

```dotenv
COMFYUI_ENABLED=false
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_TIMEOUT_SECONDS=900
```

Timeout phải nguyên 30–3600 giây. URL chỉ http(s), không username/password/query/fragment; không lấy URL từ form. Endpoint không gửi cho browser. Tắt flag chặn reservation/POST mới, **không cancel** job upstream đã có. Lượt submitted vẫn có thể theo dõi/tải kết quả; đối soát GET vẫn dùng endpoint đã snapshot. Không thay endpoint giữa một run.

Chỉ sửa `.env` và bật sau khi operator cho phép rollout. App không có đăng nhập: không mở ComfyUI/app điều khiển GPU ra public tunnel không bảo vệ. Không tự đổi `--listen`, firewall hoặc mở port. Hash endpoint là ràng buộc nhận dạng, không phải cơ chế xác thực.

## Bàn giao workflow trực tiếp từ ComfyUI

1. Operator chọn model từ nguồn chính thức, tự kiểm license và quyền dùng thương mại. Việc đọc nguồn không cấp quyền download/chạy.
2. Lưu cả workflow chỉnh sửa trong UI và bản **API format**. Pilot chỉ core nodes `CheckpointLoaderSimple`, `CLIPTextEncode`, `KSampler`, `EmptyLatentImage`, `VAEDecode`, `SaveImage`. Không custom/API/partner/code/shell nodes.
3. Chạy/nghiệm thu local bằng quyền riêng: một output PNG, batch 1, size chính xác, không animation/multi-frame. Background và foreground nền xanh phải được xem bằng mắt sau hậu xử lý.
4. Bàn giao API graph, Comfy version exact, node mappings positive/negative/seed/width/height/batch/filename_prefix, SaveImage node ID; model filename + SHA256 + URL nguồn + license note; size mặc định và allowlist.
5. Developer review graph, connections, output, fixed sampler/steps, tên model và các binding; canonical SHA256 theo `canonicalHash` trong `src/lib/comfy/registry.ts`, không dùng hash bytes của file pretty-printed thay thế. Đăng ký release bất biến theo id/revision/hash; giữ release cũ khi còn run. Không sửa release tại chỗ.
6. Chỉ thêm artifact thật vào `src/lib/comfy/workflows/<id>/<revision>.api.json` / `.manifest.json`, rồi registry. Registry rỗng là trạng thái hợp lệ, không có model/graph giả mặc định.

Preflight GET kiểm version, class/input và model filename. SHA256 model là **release attestation**: API này không xác minh hash bytes model đang nằm trên máy ComfyUI. Auto-update ComfyUI có thể làm release không tương thích; cần đối chiếu/release lại, không bỏ kiểm version để chạy cho bằng được.

## Rollout có kiểm soát

- Migration mới: `drizzle/0017_puzzling_caretaker.sql`, thêm duy nhất bảng `comfy_image_runs`, FK restrict và index active variant. Đã sinh SQL, **chưa apply**.
- Trong checkout còn migrations Automation 0015/0016 chưa được agent apply. `npm run db:migrate` có thể apply toàn bộ pending migrations, không chỉ Comfy. Operator phải review và approve scope đầy đủ trước.
- Cần dừng/loại worker cũ bằng quyền riêng, rà queue ảnh legacy, apply migrations được duyệt, rồi deploy app+worker tương thích trước khi enqueue. Ngay cả flag false, UI/legacy guards dùng bảng mới: không deploy code mới lên DB chưa migrate.
- Không chạy đồng thời worker cũ không có handler/locks này. Queue một tiến trình worker xử lý tuần tự; executor advisory lock giữ một Comfy handler, unresolved submitting/submitted/uncertain toàn cục ngăn prepared run khác gửi thêm.
- Kiểm read-only `/system_stats`, `/object_info/<class>` từ **đúng worker environment**, không chỉ browser/PowerShell host. `127.0.0.1` trong container là container, không phải Windows host. `host.docker.internal` không tự giải quyết server chỉ listen host loopback; phải thiết kế private route rồi xác nhận riêng, không mở public bind như đường tắt.

## Trạng thái và phục hồi

| Trạng thái | Ý nghĩa / hành động |
|---|---|
| prepared | Đã giữ biến thể, chưa POST; preflight từ chối chắc chắn chuyển failed; GET tạm lỗi được retry có giới hạn, hết lượt thì failed trước POST |
| submitting | Đã ghi ý định trước POST; crash ở đây KHÔNG được gửi lại |
| uncertain | Không biết upstream đã nhận hay chưa; chỉ GET đối soát hoặc abandon thủ công |
| submitted | Có prompt ID; retry/resume chỉ poll/download/postprocess cùng lượt |
| succeeded | Variant pending_review được publish atomically; redelivery không hạ ảnh đã duyệt |
| failed | Có bằng chứng rejection/terminal error; yêu cầu mới vẫn cần lựa chọn backend |
| abandoned / stale | Kết quả muộn không được publish |

`client_id`/extra_data là correlation, **không phải idempotency key**. History biến mất, GET timeout hoặc mất connection không chứng minh job chưa chạy. Adapter không tự POST retry. Inspect chỉ bind một prompt ID khi correlation + canonical graph hash khớp; giới hạn history 200 mục, không tìm thấy không chứng minh không tồn tại.

Khi job failed:
- submitted: “Tiếp tục theo dõi/tải kết quả” requeue **cùng jobRunId và runId**, không tạo ảnh mới; queue phải không còn delivery hiện hành.
- submitting/uncertain: “Đối soát” chỉ GET queue/history, không POST. Có bằng chứng unique thì bind prompt ID và chuyển submitted (hoặc failed nếu upstream xác nhận lỗi).
- abandon: operator dừng worker liên quan, xử lý/xác nhận upstream và queue, ghi note, xác nhận hai ô. Không global interrupt/clear queue từ app. Failed owner là điều kiện, không thay thế kiểm tra thực tế worker.
- Không sửa DB trực tiếp để ép uncertain thành prepared. Không dùng nút tạo lượt mới như retry tải ảnh.

Session advisory locks giữ trên dedicated pg clients (executor rồi variant); command dùng xact lock cùng variant key. Không giữ SQL transaction xuyên HTTP. Pool max 5, một Comfy handler giữ tối đa hai clients + short SQL work. DB lock/heartbeat mất thì abort protected work; pgmq visibility được gia hạn 300 giây mỗi 20 giây. Metrics runner không là nguồn trạng thái durable.

## Artifact và giới hạn

- JSON response tối đa 2 MiB; PNG tối đa 25 MiB / 16M pixel, một frame; exact source dimensions theo snapshot, decode bằng sharp trước publish. Không silently resize.
- Raw: `comfy-private/<runId>/source.png`, prefix bị `/api/files` từ chối. Không export raw graph/private path ra UI.
- Processed: `assets/<assetId>/comfy/<runId>/image.png`, immutable theo run, variant trỏ vào file này. File tạm + hard-link publish không overwrite file cũ; filesystem DATA_DIR cần hỗ trợ hard links. Nếu file tồn tại phải khớp hash/size; file mồ côi có thể phục hồi khi hash/dimensions khớp. Chưa có garbage collection.
- Background giữ PNG; chr/prop/fx dùng `keyAndTrim` hiện có. Duyệt ảnh giữ hooks casting/binding sau commit; hook lỗi không có nghĩa ảnh chưa duyệt và không được sinh lại ảnh để chữa hook.

## Điểm còn treo sau source review

- Heartbeat hiện xác nhận gọi gia hạn không ném lỗi, **chưa kiểm chứng ownership của delivery** bằng read-count/token hoặc số hàng `set_vt`. Advisory locks là lớp loại trừ riêng; chưa được coi là bảo đảm dừng ngay khi delivery bị chuyển chủ.
- Khi Comfy xác nhận lỗi terminal của base, variant chuyển failed nhưng trạng thái asset có thể vẫn generating. Retry theo variant vẫn có; nhãn asset cần được đồng bộ ở lượt chỉnh tiếp theo.

## Nghiệm thu còn thiếu — cần user cho phép riêng

Không viết/chạy test scripts. Checklist manual chi tiết ở plan/spec: flag off/registry rỗng; bg và foreground; reject feedback; crash trước/sau POST/prompt ID/raw/publish; timeout/history loss; hai tab và legacy queue cạnh tranh; abandon/late result; output sai path/size/hash; nghe/xem toàn workflow media nếu mở rộng sau này. Mọi call 9router cần budget permission riêng.

Static type/lint/build không chứng minh GPU/network/media đúng. Chưa đo thời gian, chất lượng ảnh, tiết kiệm chi phí hoặc khả năng chạy production. Pilot này chưa điều hành 100% video; Remotion vẫn là renderer tất định cho code motion/ghép media.

## Nguồn chính thống

- [Comfy server routes](https://docs.comfy.org/development/comfyui-server/comms_routes)
- [Comfy API workflow format](https://docs.comfy.org/development/api-development/workflow-api-format)
- [ComfyUI v0.43.2 server source](https://raw.githubusercontent.com/Comfy-Org/ComfyUI/v0.43.2/server.py)
- [Postgres advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions), [generate](https://orm.drizzle.team/docs/drizzle-kit-generate)
- [sharp constructor limits](https://sharp.pixelplumbing.com/api-constructor/)
- [pgmq extension source](https://github.com/pgmq/pgmq/blob/main/pgmq-extension/sql/pgmq.sql)

Context7 không được expose trong bounded lookup; dùng nguồn chính thức và installed types/source theo quyền thay thế đã cấp.
