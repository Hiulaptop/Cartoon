import Link from "next/link";
export default function AutomationLayout({ children }: { children: React.ReactNode }) {
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div><h1 className="text-2xl font-semibold">Automation</h1><p className="text-sm text-muted-foreground">Câu hỏi → bằng chứng → lời & hình → bản cuối. Không tự đăng YouTube.</p></div><nav className="flex gap-4 text-sm"><Link href="/automation">Các tập</Link><Link href="/automation/new">Câu hỏi mới</Link><Link href="/automation/settings">Hồ sơ kênh</Link></nav></div>{children}</div>;
}
