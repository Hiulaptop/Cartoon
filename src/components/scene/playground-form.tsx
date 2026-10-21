"use client";

import { useActionState, useState } from "react";

import { playground, type PlaygroundState } from "@/app/scenes/actions";
import { ScenePlayer } from "@/components/scene/scene-player";
import { Button } from "@/components/ui/button";

export function PlaygroundForm({ series }: { series: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<PlaygroundState, FormData>(playground, { json: "", issues: [] });
  const [seriesId, setSeriesId] = useState(series[0]?.id ?? "");

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        {/* Ngoài <form>: React 19 gọi form.reset() sau mỗi action, làm select nhảy về giá trị đầu. Giá trị gửi qua input ẩn. */}
        <label className="flex flex-col gap-1 text-sm">
          Bộ phim (asset dùng để kiểm tra và xem trước)
          <select value={seriesId} onChange={(e) => setSeriesId(e.target.value)} className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm">
            {series.length === 0 && <option value="">(chưa có bộ phim)</option>}
            {series.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="seriesId" value={seriesId} />
        <textarea
          key={state.json}
          name="json"
          defaultValue={state.json}
          rows={28}
          spellCheck={false}
          className="rounded-lg border border-input bg-transparent p-3 font-mono text-xs"
          placeholder="Dán JSON cảnh v1 hoặc bấm “Dùng mẫu”"
        />
        <div className="flex gap-2">
          <Button type="submit" name="intent" value="preview" disabled={pending}>
            Kiểm tra và xem trước
          </Button>
          <Button type="submit" name="intent" value="sample" variant="outline" disabled={pending}>
            Dùng mẫu
          </Button>
        </div>
        {state.issues.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
            {state.issues.map((issue) => (
              <li key={issue} className="break-words">
                {issue}
              </li>
            ))}
          </ul>
        )}
      </form>
      </div>
      <div>
        {state.preview ? (
          <ScenePlayer dsl={state.preview.dsl} assets={state.preview.assets} />
        ) : (
          <p className="text-sm text-muted-foreground">Bản xem trước hiện ở đây khi JSON qua được bước kiểm tra.</p>
        )}
      </div>
    </div>
  );
}
