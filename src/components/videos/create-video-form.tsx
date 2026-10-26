"use client";

import { useActionState, useState } from "react";

import { createDesign } from "@/app/designs/actions";
import { createAlgorithmDesign } from "@/app/algorithm/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KIND_LABELS, type AssetKind } from "@/lib/assets/naming";
import type { FormState } from "@/lib/form";
import { PIXEL_FARM_SERIES } from "@/lib/assets/pixel-farm";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export type AssetOption = { name: string; displayName: string; kind: AssetKind };
export type SeriesOption = { id: string; name: string; assets: AssetOption[]; cartoonReady?: boolean };

// Bộ asset pixel cố định được chọn sẵn nếu có.
const pickSeries = (list: SeriesOption[]) => (list.find((s) => s.name === PIXEL_FARM_SERIES) ?? list[0])?.id ?? "";

// Checkbox asset của một bộ phim (mặc định tick hết). Dùng chung cho tạo design và viết kịch bản sau.
export function AssetChecklist({ assets, selected }: { assets: AssetOption[]; selected?: string[] }) {
  return (
    <fieldset className="flex flex-col gap-1 text-sm">
      <legend className="mb-1">Asset được dùng</legend>
      {assets.map((a) => (
        <label key={a.name} className="flex items-center gap-2">
          <input type="checkbox" name="assetNames" value={a.name} defaultChecked={selected ? selected.includes(a.name) : true} />
          <span className="font-mono">{a.name}</span>
          <span className="text-muted-foreground">
            {a.displayName} · {KIND_LABELS[a.kind]}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function CreateVideoForm({ projectId, series }: { projectId: string; series: SeriesOption[] }) {
  const [cartoonState, cartoonAction, cartoonPending] = useActionState<FormState, FormData>(createDesign, {});
  const [algorithmState, algorithmAction, algorithmPending] = useActionState<FormState, FormData>(createAlgorithmDesign, {});
  const [kind, setKind] = useState<"" | "cartoon" | "algorithm">("");
  const [seriesId, setSeriesId] = useState("");
  const state = kind === "algorithm" ? algorithmState : cartoonState;
  const pending = kind === "algorithm" ? algorithmPending : cartoonPending;
  const available = kind === "cartoon" ? series.filter((s) => s.cartoonReady) : series;
  const current = available.find((s) => s.id === seriesId);

  return (
    <form action={kind === "algorithm" ? algorithmAction : cartoonAction} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      {/* Giá trị gửi qua input ẩn: React 19 gọi form.reset() sau action lỗi, làm DOM của select lệch khỏi state. */}
      <input type="hidden" name="seriesId" value={seriesId} />
      <input type="hidden" name="kind" value={kind} />
      <label className="flex flex-col gap-1 text-sm">
        Loại video
        <select required value={kind} onChange={(e) => {
          const next = e.target.value as typeof kind;
          setKind(next);
          setSeriesId(pickSeries(next === "cartoon" ? series.filter((s) => s.cartoonReady) : series));
        }} className={fieldClass}>
          <option value="">Chọn loại video trước</option>
          <option value="cartoon">Hoạt hình</option>
          <option value="algorithm">Giảng thuật toán</option>
        </select>
      </label>
      {kind && <>
      <label className="flex flex-col gap-1 text-sm">
        Bộ phim
        <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)} className={fieldClass}>
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tiêu đề (nội bộ)
        <Input name="title" required minLength={3} placeholder="Vd: Tập 1 - Bài kiểm tra bất ngờ" />
      </label>
      {kind === "algorithm" ? (
        <label className="flex flex-col gap-1 text-sm">
          Đề bài (có thể bổ sung sau)
          <textarea name="problem" rows={8} className={fieldClass} placeholder="Dán nguyên văn đề bài lập trình thi đấu" />
        </label>
      ) : <>
      <label className="flex flex-col gap-1 text-sm">
        Brief
        <textarea name="brief" rows={3} className={fieldClass} placeholder="Ý tưởng chính (để trống: LLM tự nghĩ)" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Thời lượng mục tiêu (giây)
        <Input name="targetSeconds" type="number" min={30} max={600} defaultValue={90} className="w-32" />
      </label>
      <p className="text-xs text-muted-foreground">
        Sau khi tạo, AI đề xuất asset còn thiếu cho tập này ({current?.assets.length ?? 0} asset đã duyệt của bộ phim sẽ được cân nhắc dùng lại). Bạn duyệt xong mới viết kịch bản.
      </p>
      </>}
      {available.length === 0 && <p className="text-sm text-muted-foreground">Không có bộ phim phù hợp. Hoạt hình cần nhân vật và bối cảnh đã duyệt; thuật toán chỉ cần bộ phim tồn tại.</p>}
      </>}
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending || !kind || !current} className="self-start">
        {pending ? "Đang gửi..." : "Tạo bản thiết kế"}
      </Button>
    </form>
  );
}
