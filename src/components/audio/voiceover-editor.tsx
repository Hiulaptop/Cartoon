"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestTtsTake, saveVoiceoverTimeline, reviewVoiceoverTimeline } from "@/app/audio/actions";
import type { VoiceoverEditorData } from "@/lib/audio/queries";
import type { VoiceoverClip, VoiceoverTimelineV1 } from "@/lib/audio/types";
import { validateVoiceover } from "@/lib/audio/schema";
import { TakeList } from "./take-list";
import { VoiceoverVideoPlayer } from "./video-player";

const field = "rounded border bg-transparent px-2 py-1";
const button = "rounded border px-3 py-1 disabled:opacity-50";
type NumericKey = "from" | "trimBefore" | "durationInFrames" | "volume" | "fadeInFrames" | "fadeOutFrames";
const fields: [NumericKey, string][] = [["from", "Bắt đầu"], ["trimBefore", "Bỏ đầu nguồn"], ["durationInFrames", "Độ dài"], ["volume", "Âm lượng"], ["fadeInFrames", "Fade vào"], ["fadeOutFrames", "Fade ra"]];

export function VoiceoverEditor({ data }: { data: VoiceoverEditorData }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [ttsRequestId, setTtsRequestId] = useState("");
  const [uploadRequest, setUploadRequest] = useState<{ file: File; id: string } | null>(null);
  const [wireModelId, setWireModelId] = useState("");
  const [unit, setUnit] = useState<"frames" | "seconds">("frames");
  const [timeline, setTimeline] = useState<VoiceoverTimelineV1>(data.latest?.content ?? { version: 1, fps: 30, visualFingerprint: data.fingerprint ?? "0".repeat(64), clips: [] });
  const [baseId, setBaseId] = useState<string | null>(data.latest?.id ?? null);
  const [dirty, setDirty] = useState(false);
  const videoFrames = data.visual?.visual.scenes.reduce((sum, s) => sum + s.durationFrames, 0) ?? 0;
  const checked = validateVoiceover(timeline, data.sources, videoFrames);
  const stale = !!data.fingerprint && timeline.visualFingerprint !== data.fingerprint;
  const changedElsewhere = baseId !== (data.latest?.id ?? null);
  const approvedTakes = data.takes.filter((t) => t.status === "approved");
  const edit = (next: VoiceoverTimelineV1) => { setTimeline(next); setDirty(true); };
  const changeClip = (id: string, patch: Partial<VoiceoverClip>) => edit({ ...timeline, clips: timeline.clips.map((c) => c.id === id ? { ...c, ...patch } : c) });
  const run = (work: () => Promise<void>) => startTransition(async () => { setMessage(""); try { await work(); } catch { setMessage("Thao tác chưa hoàn tất; kiểm tra kết nối và refresh để xem kết quả trước khi thử lại."); } });
  const formForVideo = () => { const form = new FormData(); form.set("videoId", data.video.id); return form; };
  function split(clip: VoiceoverClip) {
    const raw = window.prompt(`Cắt sau bao nhiêu frame? (1–${clip.durationInFrames - 1})`, String(Math.floor(clip.durationInFrames / 2)));
    if (raw === null) return;
    const cut = Number(raw);
    if (!Number.isInteger(cut) || cut <= 0 || cut >= clip.durationInFrames) { setMessage("Điểm cắt phải nằm trong clip"); return; }
    const first = { ...clip, durationInFrames: cut, fadeInFrames: Math.min(clip.fadeInFrames, cut), fadeOutFrames: 0 };
    const second = { ...clip, id: crypto.randomUUID(), from: clip.from + cut, trimBefore: clip.trimBefore + cut, durationInFrames: clip.durationInFrames - cut, fadeInFrames: 0, fadeOutFrames: Math.min(clip.fadeOutFrames, clip.durationInFrames - cut) };
    edit({ ...timeline, clips: timeline.clips.flatMap((c) => c.id === clip.id ? [first, second] : [c]) });
  }
  return <div className="space-y-6">
    <section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Bản thu</h2>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget); const file = form.get("file");
        if (!(file instanceof File) || !file.size) return;
        const id = uploadRequest?.id ?? crypto.randomUUID();
        setUploadRequest({ file, id });
        run(async () => {
          const mime = file.name.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/wav";
          const response = await fetch(`/api/designs/${data.video.id}/audio/upload`, { method: "POST", headers: { "Content-Type": mime, "X-Audio-Request-Id": id, "X-Audio-Label": encodeURIComponent(String(form.get("label") || file.name)), "X-Audio-Filename": encodeURIComponent(file.name) }, body: file });
          const result = await response.json(); setMessage(response.ok ? "Đã nhập bản thu; nghe và duyệt bên dưới." : result.error); router.refresh();
        });
      }}>
        <input className={field} name="label" placeholder="Tên bản thu" maxLength={120} required />
        <input name="file" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" required onChange={(event) => { const file = event.target.files?.[0]; setUploadRequest(file ? { file, id: crypto.randomUUID() } : null); }} />
        <button className={button} disabled={busy}>Upload MP3/WAV</button>
        <p className="w-full text-sm text-muted-foreground">MP3 hoặc WAV PCM, tối đa 25 MiB và 10 phút/file.</p>
      </form>
      <form className="space-y-2 border-t pt-3" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const id = ttsRequestId || crypto.randomUUID(); setTtsRequestId(id); form.set("requestId", id); form.set("videoId", data.video.id); form.set("modelId", wireModelId);
        run(async () => { const result = await requestTtsTake({}, form); setMessage(result.error ?? "Đã xếp hàng tạo giọng; nghe và duyệt sau khi hoàn tất."); if (!result.error) setTtsRequestId(""); router.refresh(); });
      }}>
        <h3 className="font-medium">Tạo giọng AI</h3>
        {data.ttsError && <p className="text-sm">{data.ttsError}</p>}
        <div className="flex flex-wrap gap-2">
          <input className={field} name="label" placeholder="Tên bản thu AI" maxLength={120} required onChange={() => setTtsRequestId("")} />
          <input className={field} name="speakerRef" placeholder="Người nói / narrator (tùy chọn)" maxLength={120} onChange={() => setTtsRequestId("")} />
          <select className={field} aria-label="Model và voice" value={wireModelId} onChange={(e) => { setWireModelId(e.target.value); setTtsRequestId(""); }} required>
            <option value="">Chọn model / voice</option>
            {data.models.map((model) => model.voices.length ? <optgroup label={model.label} key={model.id}>{model.voices.map((voice) => <option key={voice.wireModelId} value={voice.wireModelId}>{voice.label}</option>)}</optgroup> : <option key={model.id} disabled>{model.label} — {model.unavailable}</option>)}
          </select>
        </div>
        <textarea className={`${field} w-full`} name="text" maxLength={5000} rows={3} placeholder="Lời thoại hoặc narration; không tự dịch" required onChange={() => setTtsRequestId("")} />
        <button className={button} disabled={busy || !wireModelId}>Tạo một bản thu AI</button>
        <p className="text-sm text-muted-foreground">Mỗi lần tạo là bản thu mới. Khi lỗi/timeout, hệ thống không tự gọi lại provider.</p>
      </form>
      <TakeList takes={data.takes} errors={data.errors} />
    </section>
    <section className="space-y-3 rounded border p-4">
      <h2 className="text-lg font-semibold">Timeline lồng tiếng</h2>
      <fieldset disabled={busy} className="space-y-3">
      <p>{data.latest ? `Phiên bản ${data.latest.version} · ${data.latest.status}` : "Chưa lưu timeline"}{dirty ? " · Có thay đổi chưa lưu" : ""}</p>
      {data.visualError && <p>{data.visualError}</p>}
      {changedElsewhere && <p role="alert">Có phiên bản mới hơn. Bản đang chỉnh được giữ lại; tải bản mới trước khi lưu.</p>}
      <button className={button} disabled={busy} onClick={() => { if (!dirty || window.confirm("Bỏ thay đổi chưa lưu và tải timeline mới nhất?")) { setTimeline(data.latest?.content ?? { version: 1, fps: 30, visualFingerprint: data.fingerprint ?? "0".repeat(64), clips: [] }); setBaseId(data.latest?.id ?? null); setDirty(false); } }}>Tải timeline mới nhất</button>
      {stale && <div role="alert"><p>Cảnh đã thay đổi. Kiểm tra vị trí và thời lượng trước khi lưu/duyệt lại.</p><button className={button} onClick={() => { if (data.fingerprint) edit({ ...timeline, visualFingerprint: data.fingerprint }); }}>Đã kiểm tra theo cảnh hiện tại</button></div>}
      <div className="flex flex-wrap gap-2">
        <label>Đơn vị <select className={field} value={unit} onChange={(e) => setUnit(e.target.value as "frames" | "seconds")}><option value="frames">Frame (30 fps)</option><option value="seconds">Giây</option></select></label>
        <select className={field} aria-label="Thêm bản thu vào timeline" value="" disabled={busy || timeline.clips.length >= 64} onChange={(event) => {
          const take = approvedTakes.find((t) => t.id === event.target.value); if (!take?.durationSeconds) return;
          const from = Math.max(0, ...timeline.clips.map((c) => c.from + c.durationInFrames));
          edit({ ...timeline, clips: [...timeline.clips, { id: crypto.randomUUID(), takeId: take.id, from, trimBefore: 0, durationInFrames: Math.max(1, Math.min(Math.floor(take.durationSeconds * 30), videoFrames - from)), volume: 1, fadeInFrames: 0, fadeOutFrames: 0, allowOverlap: false, label: take.label }] });
        }}><option value="">Thêm bản thu đã duyệt…</option>{approvedTakes.map((take) => <option key={take.id} value={take.id}>{take.label}</option>)}</select>
      </div>
      {timeline.clips.map((clip) => <div className="space-y-2 rounded border p-3" key={clip.id}>
        <div className="flex flex-wrap gap-2"><input className={field} aria-label="Tên clip" value={clip.label} maxLength={120} onChange={(e) => changeClip(clip.id, { label: e.target.value })} /><input className={field} placeholder="Người nói" aria-label="Người nói của clip" value={clip.speakerRef ?? ""} maxLength={120} onChange={(e) => changeClip(clip.id, { speakerRef: e.target.value })} /></div>
        <div className="flex flex-wrap gap-3">{fields.map(([key, label]) => <label className="flex flex-col text-sm" key={key}>{label}{key === "volume" ? " (0–1)" : unit === "frames" ? " (frame)" : " (giây)"}<input className={`${field} w-28`} type="number" min={0} step={key === "volume" ? 0.05 : unit === "seconds" ? 1 / 30 : 1} value={key === "volume" || unit === "frames" ? clip[key] : Math.round(clip[key] / 30 * 1000) / 1000} onChange={(e) => changeClip(clip.id, { [key]: key === "volume" || unit === "frames" ? e.target.valueAsNumber : Math.round(e.target.valueAsNumber * 30) })} /></label>)}</div>
        <div className="flex flex-wrap gap-2"><label><input type="checkbox" checked={clip.allowOverlap} onChange={(e) => changeClip(clip.id, { allowOverlap: e.target.checked })} /> Cho phép trộn với clip khác</label>
          <button className={button} disabled={timeline.clips.length >= 64 || clip.durationInFrames < 2} onClick={() => split(clip)}>Cắt đôi</button>
          <button className={button} disabled={timeline.clips.length >= 64} onClick={() => edit({ ...timeline, clips: [...timeline.clips, { ...clip, id: crypto.randomUUID(), from: clip.from + clip.durationInFrames }] })}>Nhân bản</button>
          <button className={button} onClick={() => edit({ ...timeline, clips: timeline.clips.filter((c) => c.id !== clip.id) })}>Xóa clip</button>
        </div>
      </div>)}
      <p className="text-sm text-muted-foreground">Chỉ các clip đã bật trộn mới được giao nhau (tối đa 4). Khi tổng gain vượt 1, hệ thống giảm đều gain các clip đang phát. Lời thoại/talk-state trong cảnh vẫn chỉnh riêng ở storyboard.</p>
      {!checked.ok && <p role="alert" className="text-destructive">{checked.issues.join("; ")}</p>}
      {data.visual && checked.ok && !stale && <VoiceoverVideoPlayer scenes={data.visual.scenes} voiceover={{ timeline: checked.timeline, sources: data.sources }} />}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || !data.visual || !checked.ok || stale || changedElsewhere} onClick={() => run(async () => {
          const form = formForVideo(); form.set("content", JSON.stringify(timeline)); form.set("expectedLatestVersionId", baseId ?? "");
          const result = await saveVoiceoverTimeline({}, form); setMessage(result.error ?? "Đã lưu phiên bản mới. Tải timeline mới nhất để duyệt."); if (!result.error) setDirty(false); router.refresh();
        })}>Lưu thành phiên bản mới</button>
        <button className={button} disabled={busy || dirty || stale || changedElsewhere || !data.visual || !data.latest || !["draft", "pending_review"].includes(data.latest.status)} onClick={() => run(async () => { const form = formForVideo(); form.set("timelineId", data.latest!.id); form.set("decision", "approved"); const result = await reviewVoiceoverTimeline({}, form); setMessage(result.error ?? "Đã duyệt timeline"); router.refresh(); })}>Duyệt timeline đã lưu</button>
        <button className={button} disabled={busy || dirty || !data.latest || !["draft", "pending_review"].includes(data.latest.status)} onClick={() => { const reason = window.prompt("Lý do loại timeline (ít nhất 5 ký tự)"); if (!reason) return; run(async () => { const form = formForVideo(); form.set("timelineId", data.latest!.id); form.set("decision", "rejected"); form.set("reason", reason); const result = await reviewVoiceoverTimeline({}, form); setMessage(result.error ?? "Đã loại timeline"); router.refresh(); }); }}>Loại timeline</button>
      </div>
      </fieldset>
    </section>
    <button className={button} disabled={busy} onClick={() => router.refresh()}>Refresh bản thu / model / phiên bản</button>
    {message && <p role="status" className="whitespace-pre-wrap rounded border p-3">{message}</p>}
  </div>;
}
