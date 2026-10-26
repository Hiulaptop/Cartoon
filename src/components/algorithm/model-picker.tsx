"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type ModelInfo = { id: string; owner: string; contextLength: number | null; maxOutput: number | null; reasoning: boolean };

const fieldClass = "rounded-md border bg-background px-2 py-1.5 text-sm";
const storageKey = (scope: string) => `algorithm-model:${scope}`;

function remembered(scope: string): string {
  try { return window.localStorage.getItem(storageKey(scope)) ?? ""; } catch { return ""; }
}

function describe(model: ModelInfo): string {
  const context = model.contextLength ? ` · ${Math.round(model.contextLength / 1000)}k context` : "";
  return `${model.id}${model.owner ? ` (${model.owner})` : ""}${context}${model.reasoning ? " · reasoning" : ""}`;
}

// Chọn model cho request: bấm "Tải danh sách model" (lấy từ 9router qua /api/models), chọn rồi gửi kèm form bằng field `model`.
// Chưa tải hoặc chọn "Mặc định" thì field rỗng và backend dùng model mặc định.
export function ModelPicker({ scope }: { scope: string }) {
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setRenderTick] = useState(0);
  const root = useRef<HTMLDivElement>(null);

  // React 19 gọi form.reset() sau mỗi action: select có kiểm soát bị trả về mục đầu trong khi state vẫn giữ lựa chọn. Render lại để select khớp state.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const resync = () => setTimeout(() => setRenderTick((tick) => tick + 1), 0);
    form.addEventListener("reset", resync);
    return () => form.removeEventListener("reset", resync);
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/models", { cache: "no-store" });
      const body = (await response.json()) as { models?: ModelInfo[]; defaultModel?: string | null; error?: string };
      if (!response.ok || !body.models) throw new Error(body.error ?? `Lỗi ${response.status}`);
      setModels(body.models);
      setDefaultModel(body.defaultModel ?? null);
      const previous = remembered(scope);
      setValue(body.models.some((model) => model.id === previous) ? previous : "");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Không tải được danh sách model");
    } finally {
      setLoading(false);
    }
  }

  function choose(next: string) {
    setValue(next);
    try { window.localStorage.setItem(storageKey(scope), next); } catch { /* localStorage bị chặn: bỏ qua, chỉ không nhớ lựa chọn */ }
  }

  return (
    <div ref={root} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? "Đang tải…" : models ? "Tải lại danh sách model" : "Tải danh sách model"}
        </Button>
        {models && (
          <select name="model" value={value} onChange={(event) => choose(event.target.value)} className={fieldClass} aria-label="Model">
            <option value="">Mặc định{defaultModel ? ` (${defaultModel})` : ""}</option>
            {models.map((model) => <option key={model.id} value={model.id}>{describe(model)}</option>)}
          </select>
        )}
      </div>
      {!models && <p className="text-xs text-muted-foreground">Chưa chọn model: dùng model mặc định của hệ thống.</p>}
      {error && <p className="text-xs text-destructive">Không tải được model: {error}. Vẫn có thể chạy với model mặc định.</p>}
    </div>
  );
}
