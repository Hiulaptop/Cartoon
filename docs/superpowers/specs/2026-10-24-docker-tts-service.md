# Spec: Docker Service TTS (VieNeu-TTS v3 Turbo)

## 1. Bối cảnh & Mục tiêu
- Toàn bộ hệ thống (`app`, `worker`, `migrate`, `tts`) khởi chạy bằng một lệnh duy nhất:
  ```bash
  docker compose up -d --build
  ```
- Không phụ thuộc vào môi trường Python host ngoài máy dev.
- Service TTS cung cấp API nội bộ cho `app` và `worker` qua `http://tts:8080`, đồng thời expose ra `127.0.0.1:8080` cho máy host.
- Cache model HuggingFace được giữ lại trong named volume `cartoon_huggingface_cache` để tránh tải lại nhiều lần khi rebuild container.

## 2. Cấu trúc file mới
- `services/tts/requirements.txt`:
  - `vieneu==3.8.3`
  - `onnxruntime`
  - `fastapi`
  - `uvicorn[standard]`
  - `soundfile`
  - `numpy`
- `services/tts/server.py`:
  - FastAPI server khởi tạo Vieneu engine on CPU.
  - Hỗ trợ `/health`, `/voices`, `/synthesize` với ffmpeg `atempo` time-stretching.
- `services/tts/Dockerfile`:
  - Base `python:3.11-slim`.
  - Cài đặt `ffmpeg`, `curl`.
  - Cài package từ `requirements.txt`.
  - Expose 8080.

## 3. Cập nhật `docker-compose.yml`
- Anchor `x-runtime-env`: thêm `LOCAL_TTS_URL: ${LOCAL_TTS_URL:-http://tts:8080}`.
- Service `tts`:
  - Context `./services/tts`.
  - Volume có tên `huggingface_cache` (`cartoon_huggingface_cache`) mount vào `/root/.cache/huggingface` (xem mục 5).
  - Port `127.0.0.1:8080:8080`.
  - Healthcheck trên `http://127.0.0.1:8080/health`.
- Service `app` và `worker`: thêm `tts` vào `depends_on`.

## 4. Biến môi trường
- `.env.example`: `LOCAL_TTS_URL=` để trống; mặc định của compose là `http://tts:8080`. Đặt localhost trong `.env` sẽ làm container không gọi được tts.

## 5. Điều chỉnh khi triển khai (đã kiểm chứng)
- onnxruntime 1.31 từ chối `external data` đi qua symlink của cache HuggingFace (`External data path escapes model directory`). `server.py` sao chép file ONNX/codec sang `$HF_HOME/flat_models/` rồi truyền `onnx_dir`, và vá `OnnxV3LiteEngine._fetch` để codec lấy từ thư mục phẳng (thư viện chưa có tham số `codec_dir` qua `Vieneu()`).
- Cache model dùng named volume `cartoon_huggingface_cache` thay cho bind `./data/models/huggingface` (tránh lỗi quyền/symlink trên bind mount Windows).
- Healthcheck `start_period` 20s.
