"use client";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { automationCommand, createAutomation, updateAutomationProfile } from "@/app/automation/actions";
import { Button } from "@/components/ui/button";
import type { Profile } from "@/lib/automation/contracts";
import type { FormState } from "@/lib/form";

const field = "w-full rounded-md border bg-transparent p-2 text-sm";
export function Field({ name, label, value = "", multiline = false, type = "text" }: { name: string; label: string; value?: string | number; multiline?: boolean; type?: string }) {
  return <label className="grid gap-1 text-sm">{label}{multiline ? <textarea className={field} name={name} defaultValue={value} rows={3} /> : <input className={field} name={name} defaultValue={value} type={type} />}</label>;
}
export function BriefFields({ brief }: { brief?: { question: string; angle: string; avoid: string; urls: string[] } }) {
  return <><Field name="question" label="Câu hỏi trung tâm" value={brief?.question} /><Field name="angle" label="Góc tiếp cận / điều muốn người xem hiểu" value={brief?.angle} multiline /><Field name="avoid" label="Điều không đề cập" value={brief?.avoid} multiline /><Field name="urls" label="Nguồn HTTPS (mỗi dòng một URL, tối đa 6)" value={brief?.urls.join("\n")} multiline /></>;
}
export function VideoForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createAutomation, {});
  return <form action={action} className="grid max-w-2xl gap-4"><BriefFields />{state.error && <p role="alert" className="text-destructive">{state.error}</p>}<Button disabled={pending}>Lưu câu hỏi</Button></form>;
}
export function ProfileForm({ config, version }: { config: Profile; version: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAutomationProfile, {});
  return <form action={action} className="grid max-w-2xl gap-4"><input type="hidden" name="version" value={version} />
    <Field name="language" label="Ngôn ngữ" value={config.language} /><Field name="audience" label="Khán giả" value={config.audience} multiline /><Field name="tone" label="Giọng biên tập" value={config.tone} multiline /><Field name="avoid" label="Chủ đề tránh" value={config.avoid} multiline />
    <Field name="model" label="Model viết — ID chính xác trên 9router" value={config.model} /><Field name="voice" label="Model/voice TTS — wire ID từ metadata router" value={config.voice} /><Field name="allowedHosts" label="Hostname nguồn cho phép (khớp chính xác, mỗi dòng một host)" value={config.allowedHosts.join("\n")} multiline />
    <Field name="currency" label="Đơn vị tiền" value={config.currency} />{(["runLimit", "videoLimit", "monthlyLimit"] as const).map((key) => <Field key={key} name={key} label={{ runLimit: "Ngân sách / lượt", videoLimit: "Ngân sách / video", monthlyLimit: "Ngân sách / tháng" }[key]} value={config[key]} type="number" />)}
    <p className="text-sm text-warning">Giá router chưa xác minh: các số tiền không phải hard cap. Mỗi chặng phải được xác nhận riêng theo số request tối đa; không tự chuyển chặng có phí.</p>
    <label className="flex gap-2 text-sm"><input name="accessConfirmed" type="checkbox" defaultChecked={config.accessConfirmed} />Đã giữ local/private hoặc bảo vệ truy cập upstream.</label>
    <label className="flex gap-2 text-sm"><input name="licensesConfirmed" type="checkbox" defaultChecked={config.licensesConfirmed} />Đã xác nhận quyền thương mại voice/font và Remotion theo quy mô vận hành hiện tại.</label>
    {state.error && <p role="alert" className="text-destructive">{state.error}</p>}<Button disabled={pending}>Lưu hồ sơ</Button><p className="text-sm text-muted-foreground">Hồ sơ chỉ được snapshot khi tạo tập mới; không tự thay tập đang làm.</p>
  </form>;
}
export function CommandForm({ videoId, lockVersion, command, children, label }: { videoId: string; lockVersion: number; command: string; children?: React.ReactNode; label: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(automationCommand, {});
  const router = useRouter();
  useEffect(() => { if (!pending && !state.error) router.refresh(); }, [state, pending, router]);
  return <form action={action} className="grid gap-3"><input type="hidden" name="videoId" value={videoId} /><input type="hidden" name="lockVersion" value={lockVersion} /><input type="hidden" name="command" value={command} />{children}{state.error && <p role="alert" className="text-destructive">{state.error}</p>}<Button disabled={pending} variant="outline">{pending ? "Đang xử lý…" : label}</Button></form>;
}
