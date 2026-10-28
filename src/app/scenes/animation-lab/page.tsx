import Link from "next/link";
import { AnimationLab } from "@/components/scene/animation-lab";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { listSeries } from "@/lib/series/queries";
import type { AssetOption } from "@/lib/animation/types";

export const dynamic = "force-dynamic";
export default async function AnimationLabPage({ searchParams }: { searchParams: Promise<{ series?: string }> }) {
  const query = await searchParams;
  try {
    const series = await listSeries(), seriesId = series.find(s => s.id === query.series)?.id ?? series[0]?.id ?? "";
    const catalog = seriesId ? await loadApprovedCatalog(seriesId) : new Map();
    const options: AssetOption[] = [];
    for (const asset of catalog.values()) for (const [state, variant] of asset.variants) options.push({ ref: `@${asset.name}.${state}`, label: `${asset.displayName} · ${state}`, kind: asset.kind, width: variant.width, height: variant.height });
    return <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <Link href="/scenes/playground" className="text-sm text-muted-foreground hover:underline">← Sân thử cảnh</Link>
      <header><h1 className="text-2xl font-semibold">Animation Lab</h1><p className="mt-1 text-sm text-muted-foreground">Showcase 20 giây · Remotion · 16:9 · ảnh/state hiện có · không lưu thay đổi vào phim.</p></header>
      <form className="flex items-end gap-3"><label className="flex flex-col gap-1 text-sm">Bộ phim<select name="series" defaultValue={seriesId} className="rounded border bg-background p-2">{series.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="rounded border px-3 py-2 text-sm" type="submit">Chọn bộ phim</button></form>
      <AnimationLab key={seriesId} seriesId={seriesId} options={options} />
    </div>;
  } catch {
    return <div className="p-6"><h1 className="text-xl font-semibold">Animation Lab</h1><p className="mt-3">Chưa đọc được database local. Kiểm tra Supabase và cấu hình kết nối của app.</p></div>;
  }
}
