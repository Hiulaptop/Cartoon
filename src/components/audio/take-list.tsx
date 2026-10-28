"use client";
import { useActionState } from "react";
import { reviewAudioTake } from "@/app/audio/actions";
import type { FormState } from "@/lib/form";
import type { AudioTake } from "@/lib/audio/repository";

function TakeReview({ take }: { take: AudioTake }) {
  const [state, action, busy] = useActionState<FormState, FormData>(reviewAudioTake, {});
  return <form action={action} className="flex flex-wrap gap-2">
    <input type="hidden" name="videoId" value={take.videoId} /><input type="hidden" name="takeId" value={take.id} />
    <button name="decision" value="approved" disabled={busy} className="rounded border px-3 py-1">Duyệt bản thu</button>
    <input name="reason" placeholder="Lý do loại (ít nhất 5 ký tự)" className="rounded border px-2" />
    <button name="decision" value="rejected" disabled={busy} className="rounded border px-3 py-1">Loại</button>
    {state.error && <p role="alert" className="text-destructive">{state.error}</p>}
  </form>;
}
export function TakeList({ takes, errors }: { takes: AudioTake[]; errors: Record<string, string | null> }) {
  return <div className="space-y-3">{!takes.length && <p>Chưa có bản thu.</p>}{takes.map((take) => <section className="space-y-2 rounded border p-3" key={take.id}>
    <p className="font-medium">{take.label} · {take.source === "tts" ? "AI" : "Upload"} · {take.status}</p>
    {take.text && <p className="whitespace-pre-wrap text-sm">{take.text}</p>}
    {take.durationSeconds && <p className="text-sm">{take.durationSeconds.toFixed(2)} giây · {take.sampleRate} Hz · {take.channels} kênh</p>}
    {take.filePath && <audio controls preload="metadata" src={`/api/files/${take.filePath}`} />}
    {errors[take.id] && <p role="alert" className="text-destructive">{errors[take.id]}</p>}
    {take.status === "generating" && take.synthesisStartedAt && errors[take.id] && <p>Kết quả upstream chưa chắc chắn. Tạo yêu cầu mới nếu muốn thử lại; không tự gửi lại.</p>}
    {take.status === "pending_review" && <TakeReview take={take} />}
  </section>)}</div>;
}
