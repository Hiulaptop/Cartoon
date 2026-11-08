# ComfyUI asset pilot — thiết kế tích hợp

Ngày: 2026-10-30

Trạng thái: **user đã duyệt written spec trong chat ngày 2026-10-30** bằng phản hồi “được” sau yêu cầu duyệt spec. Cho phép viết implementation plan; chưa duyệt plan và không thay thế quyền chạy dịch vụ/migration/generation.

## 1. Mục tiêu và phạm vi

App điều hành nghiệp vụ; ComfyUI thực thi workflow ảnh đã phát hành. Pilot chứng minh chu trình yêu cầu biến thể của asset có sẵn → ComfyUI → ảnh được lưu trong app → người dùng duyệt → các bước đang có sử dụng được.

Thành công không có nghĩa đã tối ưu production, đảm bảo nhân vật nhất quán hoặc tự động sản xuất video hoàn chỉnh.

### Trong pilot

- Chọn backend tường minh `9router` hoặc `comfyui` khi yêu cầu biến thể, loại ảnh và tạo lại ảnh lỗi trên trang asset hiện có.
- Chỉ đưa backend ComfyUI vào các yêu cầu biến thể của asset đã có trong DB; hỗ trợ sinh lại `base` có sẵn nếu trạng thái cho phép.
- Một workflow text-to-image local đã được operator nghiệm thu, batch size 1, một ảnh output.
- Backend và phiên bản workflow được chốt khi enqueue, không đọc lại lựa chọn mặc định lúc worker chạy.
- Lưu trạng thái thực thi bền vững, ngăn resubmit mù quáng, lấy lại file đã sinh khi lỗi tải/hậu xử lý.
- Giữ xử lý PNG/tách nền, sở hữu theo series và luồng duyệt hiện tại.
- Tích hợp tắt mặc định, chẩn đoán kết nối chỉ đọc, provenance và hướng dẫn vận hành.

### Ngoài pilot

- Luồng tạo asset hoàn toàn mới tiếp tục dùng 9router như hiện tại; UI phải nói rõ phạm vi hỗ trợ. Không thêm LLM gọi tên/mô tả vào lượt nghiệm thu Comfy đầu tiên.
- Casting, algorithm asset resolver và job tự động chưa chọn ComfyUI; giữ nguyên backend cũ.
- Không thêm asset vào Automation độc lập, không đổi bảng/luồng Automation hiện có.
- Không voice, clip video, custom motion node, graph editor trong app, arbitrary graph upload, cloud backend, nhiều GPU hoặc hàng đợi GPU phân tán.
- Không silent fallback, tự tải model/node, tự cập nhật ComfyUI, tự chỉnh firewall/listen address, không global interrupt/clear queue.
- Không tự viết/chạy test; không tự apply migration, khởi động app/container hoặc gọi generation.

## 2. Hiện trạng đã kiểm tra

### Repo

`package.json`: Next.js 15.5.28, React 19.1.0, Remotion 4.0.537, drizzle-orm khai báo ^0.45.4; không đổi phiên bản dependency trong pilot trừ yêu cầu được duyệt riêng.

- `src/worker/asset-jobs.ts`: renderVariant sinh ảnh qua 9router, đo kích thước, `toPng` cho bg hoặc `keyAndTrim` cho loại khác, ghi file và chuyển pending_review.
- `src/app/series/asset-actions.ts`: request/reject/retry enqueue job biến thể; approve gọi casting/algorithm binding.
- `src/worker/runner.ts`: visibility 300 giây, tối đa 3 lần thử; metrics bị thay khi thành công/retry. Không dùng metrics làm nguồn trạng thái thực thi duy nhất.
- Worker xử lý tuần tự. Pilot chấp nhận một công việc dài chặn worker; giới hạn thời gian và hiển thị rõ. Không tuyên bố đã tách hàng đợi media production.
- Có nhiều thay đổi chưa commit và migration Automation chưa apply. Không reset/stash/commit hoặc apply tất cả migration để chạy pilot mà chưa rà phạm vi và xin phép.

### ComfyUI local

API GET thành công tại `http://127.0.0.1:8188` ngày 2026-10-30:

- ComfyUI 0.43.2, frontend 1.57.4, Python 3.13.12.
- PyTorch 2.12.0+rocm7.14.0, AMD Radeon RX 7700 XT, VRAM khoảng 12 GB, RAM khoảng 32 GB.
- Queue không có job, truy vấn history gần nhất không có entry.
- Node text-to-image cơ bản có mặt. Loader checkpoint/diffusion/text encoder/LoRA không có model; VAELoader chỉ liệt kê pixel_space.
- Chưa có workflow/model local được nghiệm thu; chưa gửi POST /prompt.
- Desktop đang bật tự cập nhật theo cấu hình đã đọc. Agent không thay đổi; production cần operator chốt chính sách cập nhật.

Các con số là snapshot, không là benchmark hoặc bảo đảm dung lượng. Nhãn device cuda:0 do runtime cung cấp không có nghĩa GPU NVIDIA.

## 3. Workflow được phát hành

Operator dựng workflow trong ComfyUI, chạy thử bằng quyền riêng và xuất API JSON. Chưa chọn hoặc tải model trong spec này: tích hợp fail-closed cho tới khi có bộ workflow và model đã được xác nhận.

Mỗi bản phát hành gồm:

- API graph JSON immutable trong repo, không chứa token/đường dẫn riêng của máy.
- Manifest version 1: workflow ID, revision, graph SHA-256, ComfyUI version đã nghiệm thu, danh sách class_type/node ID, model filename và SHA-256, các dependency cần thiết.
- Binding tường minh node ID + input name cho positive prompt, negative prompt nếu có, seed, width, height, batch size và SaveImage filename_prefix; output node ID chính xác.
- Allowlist kích thước, steps/sampler cố định trong graph, batch size bắt buộc 1, một output PNG.
- Nguồn model và ghi nhận operator đã kiểm tra quyền sử dụng; không suy ra giấy phép model từ giấy phép ComfyUI.

Không tự đoán node theo title, không sửa graph theo output LLM. Form chỉ gửi backend và lựa chọn workflow đã cho phép; server nạp graph/binding từ registry. Backend 9router không yêu cầu Comfy đang chạy.

Chưa có graph thật thì không tạo graph giả, không invent checkpoint filename hoặc node binding. Sau khi nhận graph, phải rà lại manifest/binding trước khi bật pilot; nếu làm thay đổi hợp đồng/phạm vi thì cập nhật spec và duyệt lại.

## 4. API adapter và an toàn kết nối

Tách module `src/lib/comfy/` khỏi nghiệp vụ asset:

- Config/registry/contracts: cấu hình server, workflow manifest, input/output validation.
- Client: GET system_stats, object_info theo node, queue/history và view; POST prompt chỉ từ worker có quyền thực thi.
- Không thêm SDK/proxy ở pilot; dùng Server API trực tiếp sau adapter và ghim phiên bản được nghiệm thu. Không giả định API ổn định xuyên phiên bản.
- Endpoint chỉ lấy từ cấu hình server, không nhận URL từ form. Không public Comfy qua app như proxy tổng quát.
- Không theo redirect khi gọi endpoint/file; output được lấy từ cùng endpoint đã cấu hình, không fetch URL tùy ý trong kết quả.
- Chỉ nhận output SaveImage đã khai báo, type output, filename/subfolder an toàn; từ chối path tuyệt đối, dot traversal và ký tự phân cách không hợp lệ.
- Ảnh tối đa 25 MiB, tối đa 16 triệu pixel, phải giải mã được; xác minh đúng kích thước workflow đã chốt, không resize che sai lệch.
- HTTP timeout hữu hạn, GET có thể thử lại trong thời gian theo dõi; POST prompt không tự retry do timeout/network failure.
- Không log API key, toàn bộ environment hoặc graph nhạy cảm. Comfy không có credential không đồng nghĩa an toàn để public.

Biến mới phải đồng bộ `.env.example` và `docker-compose.yml`: bật/tắt tích hợp mặc định false, base URL, timeout theo dõi mặc định 900 giây (giới hạn tối đa cấu hình 3600 giây). Không tự sửa `.env`.

Kết nối từ worker Docker phải được operator xác nhận riêng. Local PowerShell GET thành công không chứng minh `host.docker.internal` truy cập được server chỉ bind loopback. Không tự mở `0.0.0.0` hoặc bật tunnel.

## 5. Trạng thái bền vững và chống sinh trùng

Đề xuất một bảng mới `comfy_image_runs`, không dùng bảng Automation cho asset series.

Thông tin tối thiểu:

- UUID run ID, jobRunId duy nhất liên kết job_runs, variantId liên kết asset_variants.
- State text + CHECK: prepared, submitting, submitted, succeeded, failed, uncertain, abandoned, stale.
- Snapshot prompt/negative/seed/size/backend, workflow ID/revision/hash và graph đã parameterize/hash (không secret), model provenance.
- Endpoint identity fingerprint không chứa credential, client correlation ID riêng, prompt_id nullable.
- Raw downloaded artifact path/hash và processed artifact path/hash nullable.
- Error đã lọc, timestamps; note/timestamp đối soát hoặc abandonment.

Partial unique index: tối đa một run active hoặc unresolved cho variantId (prepared/submitting/submitted/uncertain). Một run uncertain giữ khóa cho tới đối soát. Một singleton advisory lock phía app giới hạn một run Comfy được worker thực thi tại một thời điểm; không khóa transaction DB xuyên request mạng và không đảm bảo ngăn người dùng bấm Run trực tiếp trong Comfy.

Các command request/reject/retry liên quan phải kiểm tra variant/run trong transaction và không tạo yêu cầu cạnh tranh. Guard chung tại renderVariant cũng phải từ chối job 9router/Casting/algorithm cũ nếu cùng variant đang có run Comfy active/unresolved, không chỉ dựa vào form mới. Khóa publish và reservation phải dùng cùng thứ tự, tránh deadlock; không giữ transaction qua request mạng. Publish lock variant/run, kiểm tra run vẫn là yêu cầu hiện hành; output muộn của run abandoned/stale không được ghi đè ảnh hoặc thay trạng thái duyệt. Không đổi tên/sở hữu asset.

### Chuyển trạng thái

1. Tạo/chốt run prepared và variant generating trước request generation.
2. Preflight chỉ đọc: kiểm config/graph/hash/node/model/size; lỗi ở đây chưa POST thì failed an toàn.
3. Ghi submitting trước POST /prompt; dùng client ID riêng và metadata tương quan nếu server đã xác nhận hỗ trợ. Đây không là idempotency key.
4. Nhận prompt_id và lưu durable → submitted. Worker redelivery tiếp tục đọc job đó, không POST lần nữa.
5. HTTP rejection có cấu trúc xác nhận không enqueue có thể failed; response không rõ hoặc lỗi mạng sau khi bắt đầu POST → uncertain. Không suy ra không thực thi từ mã HTTP chung.
6. Khi history xác nhận output đúng, tải raw file về app atomically, lưu hash; xử lý ảnh từ raw artifact, không gọi Comfy lại nếu tải/hậu xử lý cần lặp.
7. Ghi file theo run ID immutable, không overwrite `<state>.png` dùng chung cho run mới. Publish cập nhật filePath variant và pending_review trong transaction có owner/current-run guard → succeeded.

Heartbeat gia hạn pgmq lock mỗi 20 giây trong công việc dài. Mất lock thì dừng hoạt động phía app, không POST hoặc publish tiếp. Comfy có thể tiếp tục chạy; phải giữ trạng thái unresolved, không tự interrupt toàn server.

Hết timeout theo dõi không có nghĩa Comfy dừng: giữ submitted/unresolved và báo operator; lần tiếp tục chỉ theo dõi prompt_id cũ. History thiếu sau restart không chứng minh job chưa chạy; không tự resubmit.

Recovery đọc trạng thái bền vững, không dựa attempts/metrics. Terminal succeeded phải trả kết quả cũ khi redelivery, không đổi pending_review/approved ngược về generating.

## 6. UI, quyền chạy và đối soát

- Các form request/reject/retry trong phạm vi pilot có backend picker, mặc định 9router cho yêu cầu mới; hiển thị backend của run cũ và không âm thầm đổi khi retry.
- Retry hạ tầng là tiếp tục run cũ. Nút tạo lượt sinh mới cần hành động tường minh và chỉ hoạt động khi run trước terminal, không còn unresolved.
- Hiển thị workflow/model, requested và actual dimensions, run/prompt ID, trạng thái, lỗi và ảnh chờ duyệt.
- Giữ approveVariant cùng các hook resolveProposalsAfterApproval/bindRequestsAfterApproval; approve phải từ chối trong lúc có run chưa giải quyết của variant.
- Đối soát chỉ bởi operator: kiểm tra queue/history theo prompt ID/correlation, tiếp tục theo dõi/tải kết quả nếu có. Không tự nhận một history output chỉ vì tên file giống nhau.
- Nếu không thể xác định: operator kiểm upstream và bảo đảm run cũ không còn chạy, ghi note, xác nhận abandonment; không xóa lịch sử, không tự tạo job mới. Kết quả đến muộn bị guard chặn.
- App hiện không có đăng nhập. Chỉ bật pilot trong môi trường local/private có kiểm soát; flag không phải authentication. Không bật public tunnel với chức năng generation không được bảo vệ.

## 7. Tương thích và triển khai

Payload cũ không có backend tiếp tục là 9router. Không đổi backend của job Casting/algorithm đã queue. Contract mới phải versioned và validation fail-closed cho backend/workflow lạ.

Không refactor runner chung rộng nếu không cần; adapter/run service giữ trạng thái Comfy ngoài job_runs.metrics. Cần worker biết handler/contract mới trước khi enqueue; tránh worker container cũ nuốt job.

Thêm một migration chỉ cho bảng/index/constraint pilot, sinh bằng drizzle-kit sau khi được duyệt. Không tự apply; xem cả chuỗi pending migrations trước khi operator chạy migrate để tránh vô tình áp dụng Automation 0015/0016.

App/worker vẫn sở hữu file trong DATA_DIR; không phụ thuộc mount thư mục output Windows vào container. Production có thể đổi endpoint sang máy GPU khác nếu workflow/dependencies tương thích và kết nối được bảo vệ; không hứa chỉ đổi URL là đủ cho mọi backend cloud.

## 8. Trình tự triển khai sau duyệt

1. Chốt workflow/model thực tế và manifest; pilot không enable trước khi đủ artifact.
2. Hợp đồng, config và adapter chỉ đọc/gửi/theo dõi/tải có kiểm soát.
3. Schema/run service, transaction guards, correlation và recovery.
4. Nối biến thể asset, heartbeat, immutable files và provenance.
5. UI backend/run status/reconciliation, giữ luồng cũ.
6. Env/compose/docs, rà source và lint/typecheck/build.
7. Sau quyền runtime riêng: migrate đã rà, kiểm kết nối từ worker, pilot một bg rồi một đối tượng, duyệt và đo.

Plan chi tiết theo file được viết sau khi user duyệt written spec này; chưa triển khai từ checklist trên.

## 9. Nghiệm thu và giới hạn bằng chứng

Không tự tạo/sửa/chạy test files, fixture hoặc mock. Chỉ lint, typecheck, build và source review được tự chạy để xác minh code sau triển khai.

Các kịch bản nghiệm thu runtime chỉ thực hiện khi user cho phép riêng:

- Backend cũ vẫn hoạt động; Comfy tắt không ảnh hưởng job 9router.
- Một ảnh bg và một đối tượng nền xanh; đúng size, PNG giải mã được, ảnh duyệt/gắn vào luồng cũ.
- Reject có feedback tạo run mới; retry tải/hậu xử lý không sinh lại.
- Restart worker sau submit có prompt_id không POST lại; submitting không rõ chuyển uncertain.
- History mất, timeout, Comfy lỗi hoặc mất lock không tự sinh lại/global interrupt.
- Hai tab không tạo active run cạnh tranh; approve trong lúc unresolved bị chặn.
- Abandonment giữ lịch sử và chặn late publish.
- Workflow hash sai, thiếu node/model, output không đúng node/type/path/size bị chặn.
- Kiểm đường kết nối từ worker thực tế; không mở public endpoint.

Đo thời gian chờ/sinh/tải/hậu xử lý và chất lượng ảnh, không đặt throughput/cost tiết kiệm giả định. Điện/GPU vẫn có chi phí dù workflow không gọi dịch vụ trả phí. Không claim benchmark từ system_stats hoặc static build.

## 10. Nguồn và điểm chưa xác nhận

Nguồn chính thức đã đối chiếu:

- https://docs.comfy.org/development/comfyui-server/comms_routes — endpoint; không cung cấp bảo đảm exactly-once hoặc durability queue/history.
- https://docs.comfy.org/development/api-development/workflow-api-format — execution graph/API export.
- https://docs.comfy.org/development/run-workflows/overview — lựa chọn interface/deployment; Server API không có cross-release guarantee.
- https://docs.comfy.org/get_started/first_generation — cài model và workflow khởi đầu; không là benchmark/giấy phép thương mại.
- https://docs.comfy.org/installation/system_requirements — hỗ trợ phần cứng, không có VRAM threshold cho mọi workflow.

Context7 không có tool ở lần tra hiện tại. Dùng tài liệu chính thức và targeted source reading theo quyền thay thế đã được user cấp trước đó; không dựng knowledge graph hoặc khám phá rộng.

Chưa xác nhận: model/giấy phép được chọn, graph/bindings thực tế, chạy GPU thành công, độ ổn định AMD với workflow đó, kết nối worker Docker và hiệu năng. Các điểm này là điều kiện bật thực thi, không được giải quyết bằng giá trị giả. Không có code/schema/migration/runtime generation được thực hiện khi viết tài liệu này.
