"use client";

import { approveStage, beginVoice, saveVoiceEdit } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { ModelPicker } from "@/components/algorithm/model-picker";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { VOICE_DEFAULT_VOICE, VOICE_SPEED_DEFAULT, VOICE_SPEED_MAX, VOICE_SPEED_MIN } from "@/lib/algorithm/voice/constants";
import type { AlgorithmVoiceV1 } from "@/lib/algorithm/voice/contract";

type Clip = { cueId: string; status: string; filePath: string | null; durationMs: number | null; error: string | null };
type Scene = { id: string; dialogue: string[]; subtitles: string[] };

const fieldClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export function VoiceStage({ videoId, concurrencyVersion, acceptedScriptId, voices, scenes, activeRevision, clips, issues, warnings, runError }: {
  videoId: string;
  concurrencyVersion: number;
  acceptedScriptId: string | null;
  voices: { id: string; label: string }[];
  scenes: Scene[];
  activeRevision?: { id: string; status: string; inputFingerprint: string; content?: AlgorithmVoiceV1 };
  clips: Clip[];
  issues: string[];
  warnings: string[];
  runError?: string;
}) {
  const [beginState, beginAction, beginning] = useActionFeedback(beginVoice, { success: "Đã gửi yêu cầu tạo voice", description: "Worker đang viết văn nói và sinh audio, xem thanh tiến trình phía trên" });
  const [saveState, saveAction, saving] = useActionFeedback(saveVoiceEdit, { success: "Đã lưu chỉnh sửa", description: "Chỉ các câu đổi nội dung hoặc tốc độ được sinh lại audio" });
  const [approveState, approveAction, approving] = useActionFeedback(approveStage, { success: "Đã duyệt voice" });
  const content = activeRevision?.content;
  const canStart = Boolean(acceptedScriptId) && (!activeRevision || ["failed", "rejected", "stale", "approved"].includes(activeRevision.status));
  const clipOf = (cueId: string) => clips.find((clip) => clip.cueId === cueId);
  const allReady = Boolean(content) && content!.cues.every((cue) => clipOf(cue.id)?.status === "ready");
  const canApprove = activeRevision?.status === "pending_review" && issues.length === 0 && allReady;

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <p className="text-muted-foreground">
        LLM chuyển lời thoại đã duyệt thành văn nói, service TTS local đọc từng câu. Lời thoại và phụ đề trong kịch bản không bị đổi. Tốc độ trong khoảng {VOICE_SPEED_MIN}–{VOICE_SPEED_MAX}×.
      </p>
      {!acceptedScriptId ? (
        <p className="text-muted-foreground">Duyệt kịch bản và xử lý asset trước khi tạo voice.</p>
      ) : (
        <>
          {canStart && (
            <form action={beginAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="videoId" value={videoId} />
              <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
              <label className="flex flex-col gap-1 text-sm">Giọng (miền Nam)
                <select name="voice" defaultValue={voices.some((voice) => voice.id === VOICE_DEFAULT_VOICE) ? VOICE_DEFAULT_VOICE : voices[0]?.id} className={fieldClass}>
                  {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">Tốc độ mặc định
                <Input type="number" name="defaultSpeed" min={VOICE_SPEED_MIN} max={VOICE_SPEED_MAX} step={0.05} defaultValue={VOICE_SPEED_DEFAULT} className="w-28" />
              </label>
              <div className="w-full"><ModelPicker scope="voice" /></div>
              <ActionButton size="sm" pending={beginning}>{activeRevision ? "Tạo voice mới" : "Tạo voice"}</ActionButton>
              {beginState.error && <p className="w-full text-xs text-destructive">{beginState.error}</p>}
              {voices.length === 0 && <p className="w-full text-xs text-destructive">Không lấy được danh sách giọng; kiểm tra service TTS đang chạy.</p>}
            </form>
          )}
          {runError && <p className="text-xs text-destructive">Lỗi job voice: {runError}</p>}
          {activeRevision?.status === "generating" && <p>Đang chờ worker viết văn nói và sinh audio…</p>}
          {activeRevision && activeRevision.status !== "generating" && content && (
            <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
              <p className="font-medium">Voice · {activeRevision.status} · {content.voice} · {content.defaultSpeed}×</p>
              {issues.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-destructive">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              )}
              {warnings.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-warning">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              )}
              <form action={saveAction} className="flex flex-col gap-3">
                <input type="hidden" name="videoId" value={videoId} />
                <input type="hidden" name="revisionId" value={activeRevision.id} />
                <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm">Giọng
                    <select name="voice" defaultValue={content.voice} className={fieldClass}>
                      {voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-sm">Tốc độ mặc định
                    <Input type="number" name="defaultSpeed" min={VOICE_SPEED_MIN} max={VOICE_SPEED_MAX} step={0.05} defaultValue={content.defaultSpeed} className="w-28" />
                  </label>
                </div>
                {scenes.map((scene) => {
                  const sceneCues = content.cues.filter((cue) => cue.sceneId === scene.id);
                  if (sceneCues.length === 0) return null;
                  return (
                    <article key={scene.id} className="flex flex-col gap-2 rounded-md border bg-background p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-semibold">Cảnh {scene.id}</h3>
                        <label className="flex items-center gap-2 text-xs">Tốc độ riêng cảnh
                          <Input type="number" name={`speed:${scene.id}`} min={VOICE_SPEED_MIN} max={VOICE_SPEED_MAX} step={0.05} placeholder="mặc định" defaultValue={content.scenes.find((item) => item.sceneId === scene.id)?.speed ?? ""} className="w-24" />
                        </label>
                      </div>
                      {sceneCues.map((cue) => {
                        const clip = clipOf(cue.id);
                        return (
                          <div key={cue.id} className="flex flex-col gap-1 border-t pt-2">
                            <p className="text-xs text-muted-foreground">Lời thoại: {scene.dialogue[cue.dialogueIndex]}</p>
                            <textarea name={`text:${cue.id}`} defaultValue={cue.spokenText} rows={2} className={fieldClass} aria-label={`Văn nói cue ${cue.id}`} />
                            <div className="flex flex-wrap items-center gap-3 text-xs">
                              {clip?.status === "ready" && clip.filePath ? (
                                <>
                                  <audio controls preload="none" src={`/api/files/${clip.filePath}`} className="h-8" />
                                  <span className="text-muted-foreground">{((clip.durationMs ?? 0) / 1000).toFixed(2)} giây</span>
                                </>
                              ) : clip?.status === "failed" ? (
                                <span className="text-destructive">Lỗi sinh audio: {clip.error ?? "không rõ"}</span>
                              ) : (
                                <span className="text-muted-foreground">Chưa có audio</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </article>
                  );
                })}
                <ActionButton size="sm" variant="outline" pending={saving} pendingLabel="Đang lưu…" className="self-start">Lưu chỉnh sửa và sinh lại clip đổi</ActionButton>
                {saveState.error && <p className="text-xs text-destructive">{saveState.error}</p>}
              </form>
              {activeRevision.status === "pending_review" && (
                <form action={approveAction} className="flex flex-col gap-2">
                  <input type="hidden" name="videoId" value={videoId} />
                  <input type="hidden" name="revisionId" value={activeRevision.id} />
                  <input type="hidden" name="stage" value="voice" />
                  <input type="hidden" name="expectedFingerprint" value={activeRevision.inputFingerprint} />
                  <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
                  <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…" disabled={!canApprove} className="self-start">Duyệt voice</ActionButton>
                  {!canApprove && <p className="text-xs text-muted-foreground">Chưa thể duyệt: {issues.length > 0 ? "còn lỗi cần sửa ở trên" : "còn clip chưa sinh xong hoặc bị lỗi"}.</p>}
                  {approveState.error && <p className="text-xs text-destructive">{approveState.error}</p>}
                </form>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
