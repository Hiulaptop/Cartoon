import { ProfileForm } from "@/components/automation/forms";
import { getProfile } from "@/lib/automation/workflow";
export const dynamic = "force-dynamic";
export default async function AutomationSettingsPage() {
  try { const profile = await getProfile(); return <div className="space-y-4"><h2 className="text-xl font-semibold">Hồ sơ kênh duy nhất</h2><ProfileForm config={profile.config} version={profile.version} /></div>; }
  catch { return <p>Chưa đọc được hồ sơ Automation. Kiểm tra DB và migration trước khi cấu hình.</p>; }
}
