Bản **Implementation Plan cho Pipeline A (Pure First-Frame Anchor I2V)** dưới đây được viết ở cấp độ đặc tả kiến trúc và định hướng công nghệ (Blueprint). Bạn chỉ cần lưu nội dung này thành file `IMPLEMENTATION_PLAN_A.md` (hoặc `AGENTS.md`) để Coding Agent tự động khảo sát mã nguồn hiện tại của bạn, tự sinh cấu trúc file config phù hợp và thực thi tích hợp.

---

## 1. Ngăn xếp Công nghệ Đề xuất (Technology Stack)

Coding Agent sẽ ưu tiên tái sử dụng các thư viện đã có trong hệ thống của bạn; nếu chưa có mới cài đặt theo ngăn xếp tiêu chuẩn sau:

* **Tầng VLM & QA Gateway:** `openai` Python SDK (hoặc `httpx` bất đồng bộ) trỏ về endpoint local của **9router** (`http://localhost:20128/v1`), gọi combo `agy-flash-continuity` (`ag/gemini-3.8-flash` $\rightarrow$ `ag/gemini-3.6-flash` $\rightarrow$ `ag/gemini-3-flash-preview` $\rightarrow$ `ag/claude-sonnet-4-6`).
* **Tầng Xử lý Ảnh & Khung hình (Frame I/O):** `Pillow` (crop tỷ lệ khung hình & framing), `opencv-python-headless` hoặc `ffmpeg-python` (trích xuất lossless `frame[-1].png` để nối cảnh).
* **Tầng Quản lý Cấu hình & Kiểm tra Dữ liệu:** `PyYAML` + `Pydantic v2` (để Agent tự định nghĩa schema cấu hình và bắt lỗi dữ liệu đầu ra của VLM mà không cần viết regex thủ công phức tạp).
* **Tầng Điều phối Engine Tạo Video (I2V Execution):**
* *Nhánh Local/Cloud GPU:* ComfyUI REST/WebSocket API (`urllib` / `websockets`) chạy workflow **LTX-Video 2** (kèm node `ComfyUI-UtilsCollection` để bật chế độ `parallel-single`) hoặc **Wan 2.2 I2V** (kèm bộ tăng tốc `Causvid` / `NAG`).
* *Nhánh Commercial API (Tùy chọn):* REST Adapter cho Kling I2V / Runway Gen-4.


* **Tầng Kiểm thử Hồi quy (Pre-flight Tests):** `pytest` kiểm tra giới hạn từ (50–80 words), độ dài `focal_anchor` (<10 words) và số lượng thẻ phong cách ($\le 4$ tags).

---

## 2. Quy trình Khảo sát & Phân nhánh cho Agent (Agent Discovery Protocol)

Khi Coding Agent đọc bản kế hoạch này, Agent bắt buộc thực hiện bước khảo sát môi trường trước khi viết code hoặc sinh file config:

| Module | Mục tiêu Kỹ thuật | Điều kiện để Agent `[SKIP]` | Điều kiện để Agent `[INTEGRATE]` | Điều kiện để Agent `[BUILD_NEW]` |
| --- | --- | --- | --- | --- |
| **MOD-A1**<br>

<br>*Frame Prep & Cropper* | Đảm bảo ảnh đầu vào (`frame[0]`) khớp tỷ lệ đích (`16:9` / `9:16`) và khớp cỡ cảnh (cắt lấy phần thân trên nếu cảnh quay yêu cầu biểu cảm cận cảnh). | Hệ thống đã có sẵn pipeline xuất keyframe đầu tiên đúng độ phân giải và cỡ cảnh. | Hệ thống đã có module quản lý asset/ảnh nhân vật $\rightarrow$ Agent viết thêm hàm hook `crop_to_shot_framing()` gắn vào trước bước gọi I2V. | Chưa có xử lý ảnh $\rightarrow$ Agent tạo module chuẩn hóa ảnh bằng `Pillow`. |
| **MOD-A2**<br>

<br>*9router Motion Compiler* | Dịch `frame[0]` + ý định chuyển động thành gói Prompt cơ sinh học (50–80 từ), dùng `focal_anchor` <10 từ để tránh xung đột với pixel của Frame 0. | Hệ thống đã có bộ tạo prompt I2V tuân thủ giới hạn 50–80 từ qua 9router. | Hệ thống đã có LLM client/service $\rightarrow$ Agent cấu hình lại endpoint trỏ qua 9router, nạp System Prompt Mode A và thêm lớp kiểm tra `Pydantic` + `Best-of-3 Tournament`. | Chưa có bộ biên dịch $\rightarrow$ Agent xây dựng mới hoàn toàn module gọi 9router kèm chốt chặn cơ học. |
| **MOD-A3**<br>

<br>*I2V Engine Dispatcher* | Đẩy `frame[0]` và gói Prompt vào Engine tạo video với thông số khóa cứng chống méo mặt (`81 frames`, `CFG` an toàn, `parallel-single`). | Hệ thống đã có worker gửi job sang ComfyUI hoặc Video API kèm cơ chế ghi đè tham số node. | Hệ thống đã có client gọi ComfyUI/API cơ bản $\rightarrow$ Agent viết hàm tiêm (inject) thông số khóa cứng (`ref_latent_mode`, `cfg`, `length`) vào payload hiện tại. | Chưa có bộ điều phối video $\rightarrow$ Agent tạo adapter giao tiếp với ComfyUI API / Cloud API. |
| **MOD-A4**<br>

<br>*Last-Frame Chainer & Vision QA* | Trích xuất `frame[-1].png` làm Frame 0 cho cảnh kế tiếp; dùng Gemini Vision trên 9router chấm điểm đối chiếu `[Frame_0, Frame_Last]`. | Chỉ tạo 1 cảnh đơn lẻ và không cần kiểm định tự động hay nối cảnh. | Hệ thống đã có luồng nhận file `.mp4` đầu ra $\rightarrow$ Agent gắn callback trích xuất frame cuối bằng OpenCV/FFmpeg và gọi 9router kiểm tra độ trôi nét vẽ. | Chưa có hậu kiểm $\rightarrow$ Agent xây dựng vòng lặp trích xuất frame cuối + `Self-Healing Retry Loop`. |

---

## 3. Đặc tả Kỹ thuật Từng Module (Để Agent Tự Sinh Code & Config)

### Module A1: Chuẩn hóa Khung hình Neo Đầu tiên (`MOD-A1: Frame0 Prep`)

* **Nguyên lý:** Mô hình I2V rất dễ làm biến dạng mắt/miệng nếu phải tự nội suy chi tiết từ một bức ảnh toàn thân có vùng mặt quá nhỏ.
* **Yêu cầu cho Agent:**
* Thiết kế hàm nhận vào ảnh gốc và loại khung cảnh (`full_shot`, `medium_shot`, `close_up`).
* Tự động cắt vùng lấy nét tương ứng và căn chỉnh tỷ lệ khung hình mà không làm co kéo (stretch) tỷ lệ cơ thể nhân vật.
* Tạo các khóa cấu hình động trong file config (do Agent tự thiết kế) cho phép tùy chỉnh độ phân giải đích (mặc định `1280x720` hoặc `832x480` khi chạy nháp).



### Module A2: Bộ Biên dịch Chuyển động Cơ sinh học qua 9router (`MOD-A2: Agy Motion Compiler`)

* **Nguyên lý:** Chống xung đột điều kiện hóa (Conditioning Conflict). Không mô tả lại chi tiết ngoại hình đã có sẵn trong Frame 0.
* **Yêu cầu cho Agent:**
* Cấu hình kết nối tới 9router (`agy-flash-continuity`) với `temperature` thấp (`0.1–0.2`) và `reasoning_effort="low"`.
* Xây dựng System Prompt Mode A yêu cầu mô hình sinh **Best-of-3 Candidates** (3 phương án mô tả chuyển động cơ sinh học khác nhau về độ mở góc xoay khớp/cơ thể) trong cùng 1 JSON phản hồi, tự chấm điểm rủi ro biến dạng (`morph_risk_score`) và chọn ra bản an toàn nhất.
* Áp dụng **Chốt chặn Cơ học bằng Code (Deterministic Guardrails)** sau khi nhận JSON từ 9router:
1. Lọc bỏ mọi thẻ `<think>...</think>` và các cụm từ mở đầu tĩnh (*"The image showcases..."*, *"In this scene..."*).
2. Đảm bảo chủ thể chỉ được gọi bằng `focal_anchor` ngắn gọn (**dưới 10 từ**).
3. Kiểm tra tổng độ dài Positive Prompt nằm gọn trong khoảng **50–80 từ**, tuân thủ đúng thứ tự: `[Focal Anchor + Chuyển động cơ sinh học định lượng góc/bộ phận] -> [Vật lý thứ cấp: gió/lông/vải/đạo cụ] -> [Khóa tĩnh nền/máy quay] -> [Ánh sáng] -> [Tối đa 4 thẻ khóa phong cách 2D/3D + Thẻ neo nhất quán]`.
4. Tự động ghép chuỗi **Negative Prompt (12–15 từ khóa)** chia theo 4 nhóm: chống trôi nhận dạng, chống trôi sang 3D/người thật, chống lỗi giải phẫu chi/mỏ/tay, và chống đóng băng khung hình (`Ken Burns zoom`). Tự động loại bỏ từ khóa `motion blur` khỏi danh sách cấm nếu cảnh quay có từ khóa hành động nhanh.





### Module A3: Bộ Điều phối Thực thi Video I2V (`MOD-A3: Engine Dispatcher`)

* **Nguyên lý:** Khóa các thông số suy luận không-thời gian để luồng văn bản không ghi đè lên luồng cấu trúc của Frame 0.
* **Yêu cầu cho Agent:**
* Kiểm tra hệ thống hiện tại đang dùng engine nào (ComfyUI LTX-Video 2, ComfyUI Wan 2.2 I2V, hay Cloud API) để sinh cấu hình mapping tương ứng.
* Nếu là ComfyUI, tự động tìm các node trong workflow API để khóa cứng: thời lượng `81 frames` (5 giây @ 16 FPS), `CFG` trong ngưỡng an toàn (`3.0–3.5` cho LTX-2; `5.0–6.0` cho Wan 2.2), và bật chế độ `parallel-single` trên node mã hóa của LTX-2 (hoặc `Causvid` / `NAG` trên Wan 2.2).



### Module A4: Nối Chuỗi Cảnh & Giám khảo Thị giác Tự Hàn gắn (`MOD-A4: Chainer & Self-Healing QA`)

* **Nguyên lý:** Dùng khả năng đa phương thức miễn phí của `ag/gemini-3.8-flash` trên 9router thay thế hoàn toàn việc phải cài đặt các mô hình CLIP/DINOv2 nặng nề trên GPU.
* **Yêu cầu cho Agent:**
* Ngay khi video 5 giây sinh xong, trích xuất khung hình cuối cùng (`frame[-1].png`) ở định dạng không nén.
* Gửi cặp ảnh `[Frame_0_Anchor, Frame_81_Last]` kèm `focal_anchor` và `style_lock_tags` lên `agy-flash-continuity`.
* Yêu cầu Gemini trả về điểm số đồng nhất nhận dạng (`identity_score`), cờ báo trôi phong cách (`style_drift_detected` — ví dụ nét vẽ 2D bị biến thành đổ bóng 3D), và cờ báo biến dạng giải phẫu/đạo cụ (`anatomy_or_prop_deformed`).
* **Cơ chế Tự Hàn gắn (Self-Healing Loop):** Nếu đạt chuẩn, lưu `frame[-1].png` làm Frame 0 cho phân cảnh kế tiếp. Nếu trượt, lấy trường `retry_advice` từ phản hồi của Gemini đẩy ngược lại vào `MOD-A2` để tự động hạ cấp độ chuyển động (từ *Moderate* xuống *Subtle*) và gọi render lại (tối đa 2 lần retry).



---

## 4. Lộ trình Triển khai theo Giai đoạn (Milestones cho AgentThực thi)

1. **Khảo sát Workspace & Sinh Cấu hình Động (Discovery & Config Generation):**
Coding Agent quét toàn bộ thư mục dự án hiện tại, xác định các thành phần đã có sẵn để gán nhãn `[SKIP]`, `[INTEGRATE]` hoặc `[BUILD_NEW]`. Dựa trên kết quả khảo sát, Agent khởi tạo file cấu hình trung tâm và định nghĩa schema dữ liệu bằng `Pydantic`.


2. **Xây dựng & Kiểm thử Độc lập Bộ Biên dịch 9router (MOD-A2 + Pre-flight Tests):**
Agent triển khai module kết nối 9router (`agy-flash-continuity`), soạn System Prompt Mode A (tích hợp đấu loại Best-of-3) và bộ lọc cơ học 50–80 từ. Chạy bộ test `pytest` với ảnh mẫu để xác nhận đầu ra JSON sạch, không dính thẻ `<think>`, không có câu mở đầu tĩnh và đúng giới hạn từ trước khi chạm tới GPU.


3. **Tích hợp Tiền xử lý Khung hình (MOD-A1) & Hậu kiểm Thị giác (MOD-A4):**
Agent viết hoặc gắn hook chuẩn hóa/cắt khung hình đầu vào (`MOD-A1`) và luồng trích xuất `frame[-1].png` kết hợp chấm điểm QA qua 9router (`MOD-A4`). Kiểm thử vòng lặp tự hàn gắn (Self-Healing Retry) bằng cách giả lập một kết quả QA báo lỗi méo mặt để xác nhận `MOD-A2` tự động viết lại prompt nhẹ nhàng hơn.


4. **Đấu nối Engine Tạo Video (MOD-A3) & Chạy Chuỗi Cảnh Nối tiếp:**
Agent kết nối đầu ra của `MOD-A2` vào ComfyUI API (hoặc Video API hiện có của hệ thống), khóa các thông số an toàn (`81 frames`, `CFG`, `parallel-single`) và chạy thử nghiệm nối tiếp 2–3 cảnh liên hoàn thông qua `frame[-1].png`.