"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ActionButton } from "@/components/action-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PRESET_SOUTH_VOICES, type TTSVoice } from "@/lib/tts/client";

const SAMPLE_TEXTS = [
  {
    title: "Mở đầu (Hook)",
    text: "Bạn có biết, tìm kiếm nhị phân có thể tìm một số trong một triệu phần tử chỉ với hai mươi bước không?",
  },
  {
    title: "Truy vết (Trace)",
    text: "Bây giờ, ta so sánh phần tử ở giữa với giá trị cần tìm. Nếu nhỏ hơn, ta bỏ toàn bộ nửa bên trái.",
  },
  {
    title: "Độ phức tạp (Complexity)",
    text: "Mỗi bước ta loại đi một nửa không gian tìm kiếm, vì vậy độ phức tạp thời gian chỉ là O của log n.",
  },
  {
    title: "Khai báo mảng",
    text: "Cho mảng số nguyên A gồm N phần tử đã được sắp xếp tăng dần.",
  },
];

export function TTSTester({ initialVoice }: { initialVoice?: string }) {
  const [voices, setVoices] = useState<TTSVoice[]>([...PRESET_SOUTH_VOICES]);
  const [selectedVoice, setSelectedVoice] = useState<string>(initialVoice || "Adam");
  const [speed, setSpeed] = useState<number>(1.25);
  const [text, setText] = useState<string>(SAMPLE_TEXTS[0].text);
  const [loading, setLoading] = useState<boolean>(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [genTime, setGenTime] = useState<string | null>(null);
  const [serviceStatus, setServiceStatus] = useState<"checking" | "online" | "offline">("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadVoices() {
      try {
        const res = await fetch("/api/tts");
        if (res.ok) {
          const data = await res.json();
          if (data.healthy) {
            setServiceStatus("online");
          } else {
            setServiceStatus("offline");
          }
          if (data.voices && data.voices.length > 0) {
            setVoices(data.voices);
          }
        } else {
          setServiceStatus("offline");
        }
      } catch {
        setServiceStatus("offline");
      }
    }
    loadVoices();
  }, []);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: selectedVoice,
          speed,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Lỗi kết nối máy chủ TTS" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const timeHeader = res.headers.get("X-Generation-Time");
      if (timeHeader) setGenTime(timeHeader);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setAudioUrl(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Lỗi không xác định";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const southVoices = voices.filter((v) => v.is_south);
  const otherVoices = voices.filter((v) => !v.is_south);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold">Thử nghiệm & Chọn Giọng đọc (VieNeu-TTS v3 Turbo)</h1>
          <p className="text-sm text-muted-foreground">
            Phát âm Tiếng Việt tự nhiên trên CPU máy dev qua ONNX Runtime · Không đóng dấu bản quyền
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block size-2.5 rounded-full ${
              serviceStatus === "online"
                ? "bg-success"
                : serviceStatus === "offline"
                ? "bg-destructive"
                : "bg-warning animate-pulse"
            }`}
          />
          <span className="text-xs font-medium text-muted-foreground">
            {serviceStatus === "online"
              ? "Service: 127.0.0.1:8080 (Online)"
              : serviceStatus === "offline"
              ? "Service: Offline (cần chạy server TTS)"
              : "Đang kiểm tra kết nối..."}
          </span>
        </div>
      </div>

      {serviceStatus === "offline" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">TTS Service cục bộ chưa được bật!</p>
          <p className="mt-1 text-xs opacity-90">
            Hãy chạy lệnh sau trong terminal để khởi động service VieNeu-TTS:
            <br />
            <code className="mt-1 inline-block rounded bg-black/10 px-2 py-0.5 font-mono text-foreground dark:bg-white/10">
              docker compose up -d --build tts
            </code>
          </p>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Cấu hình giọng đọc</CardTitle>
            <CardDescription>Chọn giọng miền Nam và tốc độ đọc phù hợp với video Shorts</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">GIỌNG ĐỌC</label>
              <select
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <optgroup label="--- Giọng miền Nam đề xuất ---">
                  {southVoices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </optgroup>
                {otherVoices.length > 0 && (
                  <optgroup label="--- Các giọng khác (Bắc / Trung) ---">
                    {otherVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                <label>TỐC ĐỘ PHÁT (SPEED)</label>
                <span className="font-mono text-primary font-bold">{speed.toFixed(2)}×</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="1.5"
                step="0.05"
                value={speed}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>0.8× (chậm)</span>
                <span className="text-primary font-medium">1.25× (Shorts chuẩn)</span>
                <span>1.5× (rất nhanh)</span>
              </div>
            </div>

            <div className="pt-2">
              <label className="text-xs font-semibold text-muted-foreground">CÂU MẪU NHANH</label>
              <div className="mt-2 flex flex-col gap-1.5">
                {SAMPLE_TEXTS.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setText(sample.text)}
                    className="rounded border border-border/60 bg-muted/30 px-2.5 py-1.5 text-left text-xs transition hover:bg-muted"
                  >
                    <span className="font-semibold text-foreground">{sample.title}:</span>{" "}
                    <span className="text-muted-foreground line-clamp-1">{sample.text}</span>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Nội dung câu nói</CardTitle>
            <CardDescription>Nhập câu thoại hoặc giải thích thuật toán cần đọc thử</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Nhập nội dung tiếng Việt..."
              className="w-full rounded-lg border border-input bg-transparent p-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />

            <div className="flex items-center justify-between">
              <ActionButton onClick={handleGenerate} pending={loading} pendingLabel="Đang sinh âm thanh..." disabled={!text.trim()}>
                🔊 Đọc thử ngay
              </ActionButton>
              {genTime && (
                <span className="text-xs text-muted-foreground font-mono">
                  Thời gian xử lý: <strong className="text-foreground">{genTime}s</strong>
                </span>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            {audioUrl && (
              <div className="mt-4 flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Kết quả âm thanh:</span>
                  <a
                    href={audioUrl}
                    download={`tts_${selectedVoice}_${speed}x.wav`}
                    className="text-xs text-primary underline"
                  >
                    Tải về WAV (48kHz)
                  </a>
                </div>
                <audio key={audioUrl} controls autoPlay className="w-full" src={audioUrl} />
                <p className="text-xs text-muted-foreground">
                  Giọng đang nghe: <strong>{selectedVoice}</strong> | Tốc độ: <strong>{speed}×</strong> | Động cơ: VieNeu-TTS v3 Turbo
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
