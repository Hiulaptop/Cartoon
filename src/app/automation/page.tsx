import Link from "next/link";
import { BriefSchema } from "@/lib/automation/contracts";
import { listVideos } from "@/lib/automation/workflow";
export const dynamic = "force-dynamic";
export default async function AutomationPage() {
  let videos;
  try { videos = await listVideos(); } catch { return <p className="rounded-lg border p-4">Automation chưa đọc được dữ liệu. Cần kiểm tra kết nối và áp dụng migration sau khi được cho phép; app không tự migrate từ trang này.</p>; }
  return <div className="space-y-4"><p className="text-sm text-muted-foreground">Mục tiêu pilot: khoảng 1 tập/tuần với 5 giờ người; chưa phải năng suất đã đo. Ba lần duyệt là bắt buộc.</p>{!videos.length && <p>Chưa có tập. <Link href="/automation/new" className="underline">Bắt đầu bằng một câu hỏi</Link>.</p>}<div className="divide-y rounded-lg border">{videos.map((video) => <Link key={video.id} href={`/automation/${video.id}`} className="flex flex-wrap justify-between gap-3 p-4 hover:bg-muted"><div><h2 className="font-medium">{BriefSchema.parse(video.brief).question}</h2><p className="text-xs text-muted-foreground">{video.updatedAt.toLocaleString("vi-VN")}{video.archived ? " · Đã lưu trữ" : ""}</p></div><span className="text-sm">{video.stage} · {video.state}</span></Link>)}</div></div>;
}
