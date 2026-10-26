import io
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import quote

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="VieNeu-TTS Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def prepare_flat_model_dirs():
    """
    Chuẩn bị thư mục phẳng (flat copy) cho các file ONNX để tránh lỗi
    [ONNXRuntimeError] : FAIL : External data path escapes model directory
    khi huggingface_hub dùng symlinks trong môi trường Linux Docker.
    """
    from huggingface_hub import hf_hub_download
    from vieneu._v3_turbo_engine.onnx_runtime_lite import _GRAPH_FILES, _CODEC_FILES, _V3_REPO, _CODEC_REPO

    cache_base = Path(os.environ.get("HF_HOME", "/root/.cache/huggingface")).resolve()
    flat_onnx_dir = cache_base / "flat_models" / "onnx_update"
    flat_codec_dir = cache_base / "flat_models" / "codec"
    flat_onnx_dir.mkdir(parents=True, exist_ok=True)
    flat_codec_dir.mkdir(parents=True, exist_ok=True)

    print("[INFO] Syncing ONNX graph files to flat directory...", flush=True)
    for fn in _GRAPH_FILES:
        try:
            src = hf_hub_download(_V3_REPO, fn, subfolder="onnx_update")
            dest = flat_onnx_dir / fn
            if not dest.exists() or dest.stat().st_size == 0:
                shutil.copy2(src, dest)
        except Exception as e:
            if not fn.endswith(".json"):
                print(f"[WARN] Failed fetching graph file {fn}: {e}", flush=True)

    for fn in _CODEC_FILES:
        try:
            src = hf_hub_download(_CODEC_REPO, fn)
            dest = flat_codec_dir / fn
            if not dest.exists() or dest.stat().st_size == 0:
                shutil.copy2(src, dest)
        except Exception as e:
            if not fn.endswith(".json"):
                print(f"[WARN] Failed fetching codec file {fn}: {e}", flush=True)

    return str(flat_onnx_dir), str(flat_codec_dir)

print("[INFO] Initializing Vieneu engine...", flush=True)
t0 = time.time()
onnx_dir, codec_dir = prepare_flat_model_dirs()

# Monkey-patch OnnxV3LiteEngine._fetch để luôn trả về codec_dir khi tải codec_repo
import vieneu._v3_turbo_engine.onnx_runtime_lite as onnx_lite_module
_orig_fetch = onnx_lite_module.OnnxV3LiteEngine._fetch
def _patched_fetch(*args, **kwargs) -> Path:
    repo = args[0] if len(args) > 0 else kwargs.get("repo", "")
    if repo == onnx_lite_module._CODEC_REPO:
        return Path(codec_dir)
    return _orig_fetch(*args, **kwargs)
onnx_lite_module.OnnxV3LiteEngine._fetch = staticmethod(_patched_fetch)

from vieneu import Vieneu
tts = Vieneu(onnx_dir=onnx_dir)
print(f"[INFO] Vieneu loaded in {round(time.time() - t0, 2)}s", flush=True)
VOICE_IDS = [voice_id for _, voice_id in tts.list_preset_voices()]

class SynthesizeRequest(BaseModel):
    text: str
    voice: str = "Adam"
    speed: float = 1.25
    # Tuỳ chọn biểu cảm: engine bỏ qua `style` (kiểu đọc đến từ giọng tham chiếu); temperature cao hơn làm cao độ biến thiên hơn (đo 2026-10-25: F0 std 4,8 -> 5,8 semitone ở 1,0; 1,15 không hơn).
    temperature: float | None = None

@app.get("/health")
def health():
    return {"status": "ok", "engine": "vieneu-v3turbo"}

@app.get("/voices")
def get_voices():
    raw = tts.list_preset_voices()
    items = []
    for label, voice_id in raw:
        items.append({
            "label": label,
            "id": voice_id,
            "is_south": "Nam · Nam" in label or "Nữ · Nam" in label,
            "gender": "female" if "Nữ" in label else "male",
        })
    return {"voices": items}

@app.post("/synthesize")
def synthesize(req: SynthesizeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    # Giọng sai là lỗi của người gọi (400), kiểm trước khi tốn thời gian sinh; trả danh sách giọng hợp lệ.
    if req.voice not in VOICE_IDS:
        raise HTTPException(status_code=400, detail=f"Giọng '{req.voice}' không tồn tại. Giọng hợp lệ: {', '.join(VOICE_IDS)}")

    t_start = time.time()
    try:
        options = {}
        if req.temperature is not None:
            options["temperature"] = max(0.3, min(1.3, req.temperature))
        audio = tts.infer(req.text, voice=req.voice, **options)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    arr = np.asarray(audio, dtype=np.float32).reshape(-1)
    sample_rate = 48000

    speed = max(0.5, min(2.0, req.speed))
    if abs(speed - 1.0) > 0.02:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as in_tmp, \
             tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as out_tmp:
            in_path = in_tmp.name
            out_path = out_tmp.name

        try:
            sf.write(in_path, arr, sample_rate)
            cmd = [
                "ffmpeg", "-y", "-i", in_path,
                "-filter:a", f"atempo={speed}",
                "-vn", out_path
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if res.returncode != 0:
                print(f"[WARN] ffmpeg atempo failed: {res.stderr.decode('utf-8', errors='ignore')}", flush=True)
                buf = io.BytesIO()
                sf.write(buf, arr, sample_rate, format="WAV")
                data = buf.getvalue()
            else:
                data = Path(out_path).read_bytes()
        finally:
            try:
                os.remove(in_path)
                os.remove(out_path)
            except Exception:
                pass
    else:
        buf = io.BytesIO()
        sf.write(buf, arr, sample_rate, format="WAV")
        data = buf.getvalue()

    gen_time = round(time.time() - t_start, 2)
    return Response(
        content=data,
        media_type="audio/wav",
        headers={
            "X-Generation-Time": str(gen_time),
            # Header HTTP chỉ mã hóa được Latin-1: tên giọng như "Thục Đoan" phải được mã hóa phần trăm, nếu không Response() ném UnicodeEncodeError (500).
            "X-Voice": quote(req.voice, safe=""),
            "X-Speed": str(speed),
        }
    )

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"[INFO] Starting server on port {port}...", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
