"use client";

import { Player } from "@remotion/player";
import { useState, useTransition } from "react";
import { previewAnimation } from "@/app/scenes/animation-lab/actions";
import { initialDraft } from "@/lib/animation/schema";
import { SHOWCASE, type AssetOption, type Draft, type ShowcaseProps } from "@/lib/animation/types";
import { validateShowcase } from "@/lib/animation/validate";
import { AnimationShowcase } from "@/remotion/showcase/AnimationShowcase";

const inputClass = "rounded border border-input bg-background px-2 py-1.5 text-sm";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const groundTemplate = { mode: "ground_plane", horizonY: 0.4, epsilon: 0.03, confirmed: false, referenceFoot: { x: 0.5, y: 0.87 }, referenceHeight: 0.32, farFoot: { x: 0.4, y: 0.7 }, nearFoot: { x: 0.6, y: 0.9 }, standingRegions: [[{ x: 0.05, y: 0.55 }, { x: 0.95, y: 0.55 }, { x: 0.95, y: 0.97 }, { x: 0.05, y: 0.97 }]] };

export function AnimationLab({ seriesId, options }: { seriesId: string; options: AssetOption[] }) {
  const backgrounds = options.filter(o => o.kind === "bg"), characters = [...new Map(options.filter(o => o.kind === "chr").map(o => [o.ref.split(".")[0], o])).values()];
  const decorations = options.filter(o => o.kind === "prop" || o.kind === "chr");
  const [draft, setDraft] = useState<Draft | null>(() => backgrounds[0] && characters[0] ? initialDraft(seriesId, backgrounds[0].ref, characters[0].ref.split(".")[0]) : null);
  const [layout, setLayout] = useState(pretty(draft?.layout ?? {})), [anchors, setAnchors] = useState("{}"), [midground, setMidground] = useState("[]"), [propsJson, setPropsJson] = useState("[]");
  const [decoration, setDecoration] = useState(decorations[0]?.ref ?? ""), [resolved, setResolved] = useState<ShowcaseProps | null>(null), [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const invalidate = () => { setResolved(null); setError(""); };
  function update(patch: Partial<Draft>) { invalidate(); setDraft(d => d ? { ...d, ...patch } : d); }
  function addItem(layer: "mid" | "fore") {
    if (!decoration) return;
    if (layer === "fore" && !decoration.startsWith("@prop_")) { setError("Foreground prop chỉ nhận đạo cụ @prop_"); return; }
    try {
      const list = JSON.parse(layer === "mid" ? midground : propsJson);
      if (!Array.isArray(list)) throw new Error("Danh sách layer phải là mảng JSON");
      if (list.length >= (layer === "mid" ? 8 : 4)) throw new Error("Layer đã đủ số item tối đa");
      const item = { id: `${layer}_${list.length + 1}`, ref: decoration, x: 0.25, y: 0.88, height: 0.25, anchor: { x: 0.5, y: 1 }, flip: false, clips: [] };
      invalidate(); (layer === "mid" ? setMidground : setPropsJson)(pretty([...list, item]));
    } catch (e) { setError(e instanceof Error ? e.message : "JSON không hợp lệ"); }
  }
  function preview() {
    if (!draft) return;
    startTransition(async () => {
      setResolved(null); setError("");
      try {
        const input = { ...draft, layout: JSON.parse(layout), anchorByState: JSON.parse(anchors), midgroundItems: JSON.parse(midground), foregroundProps: JSON.parse(propsJson), assetFingerprints: {} };
        const result = await previewAnimation(pretty(input));
        if (result.props) {
          const issues = validateShowcase(result.props);
          if (issues.length) setError(issues.join("\n")); else setResolved(result.props);
        } else setError(result.error ?? "Không thể preview");
      } catch (e) { setError(e instanceof Error ? e.message : "JSON không hợp lệ"); }
    });
  }
  function download() {
    if (!resolved) return;
    const url = URL.createObjectURL(new Blob([pretty(resolved.draft)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "animation-showcase-draft.json"; a.click(); URL.revokeObjectURL(url);
  }
  if (!draft) return <p className="rounded border p-5">Cần ít nhất một nhân vật và một nền đã duyệt trong bộ phim này. Lab không tự tạo hoặc duyệt asset.</p>;
  return <div className="grid gap-6 xl:grid-cols-[minmax(300px,420px)_1fr]">
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-4 disabled:opacity-60">
      <section className="flex flex-col gap-2 rounded-xl border p-4"><h2 className="font-semibold">1 · Background tĩnh</h2>
        <select aria-label="Background" className={inputClass} value={draft.backgroundRef} onChange={e => update({ backgroundRef: e.target.value })}>{backgrounds.map(o => <option key={o.ref} value={o.ref}>{o.label} · {o.width}×{o.height}</option>)}</select>
        {!backgrounds.some(o => o.width * 9 === o.height * 16) && <p className="text-sm text-amber-600">Chưa có nền 16:9 đã duyệt. Preview/export cần nền đúng tỷ lệ; ảnh vuông không tự crop/resize.</p>}
      </section>
      <section className="flex flex-col gap-2 rounded-xl border p-4"><h2 className="font-semibold">2 · Midground tĩnh</h2><p className="text-xs text-muted-foreground">Nhà, cây, xe đỗ, người phụ. Cutout cần alpha. Để [] nếu nền hiện là ảnh gộp.</p>
        <select aria-label="Asset thêm vào layer" className={inputClass} value={decoration} onChange={e => setDecoration(e.target.value)}>{decorations.map(o => <option key={o.ref} value={o.ref}>{o.ref}</option>)}</select>
        <button type="button" className={inputClass} onClick={() => addItem("mid")}>Thêm midground item</button>
        <label className="text-xs">Midground JSON<textarea className={`${inputClass} mt-1 w-full font-mono`} rows={5} value={midground} onChange={e => { invalidate(); setMidground(e.target.value); }} /></label>
      </section>
      <section className="flex flex-col gap-2 rounded-xl border p-4"><h2 className="font-semibold">3 · Foreground động</h2>
        <select aria-label="Nhân vật chính" className={inputClass} value={draft.characterRef} onChange={e => { setAnchors("{}"); update({ characterRef: e.target.value }); }}>{characters.map(o => <option key={o.ref} value={o.ref.split(".")[0]}>{o.label.split(" · ")[0]}</option>)}</select>
        <label className="text-sm">Cường độ<select className={`${inputClass} ml-2`} value={draft.intensity} onChange={e => update({ intensity: e.target.value as Draft["intensity"] })}><option value="subtle">Nhẹ</option><option value="normal">Vừa</option><option value="strong">Mạnh</option></select></label>
        <button type="button" className={inputClass} onClick={() => addItem("fore")}>Thêm đạo cụ đã chọn vào foreground</button>
        <label className="text-xs">Foreground props JSON<textarea className={`${inputClass} mt-1 w-full font-mono`} rows={5} value={propsJson} onChange={e => { invalidate(); setPropsJson(e.target.value); }} /></label>
        <label className="text-xs">Anchor theo state · ví dụ {`{"base":{"x":0.5,"y":1}}`}<textarea className={`${inputClass} mt-1 w-full font-mono`} rows={3} value={anchors} onChange={e => { invalidate(); setAnchors(e.target.value); }} /></label>
      </section>
      <section className="flex flex-col gap-2 rounded-xl border p-4"><h2 className="font-semibold">Horizon và vùng đứng</h2><p className="text-xs text-muted-foreground">Mốc mặc định 0.40. Chỉ bật ground khi đã căn theo nền; foreground luôn trước midground.</p>
        <div className="flex gap-2"><button type="button" className={inputClass} onClick={() => { invalidate(); setLayout(pretty({ mode: "flat", referenceFoot: { x: 0.5, y: 0.87 }, referenceHeight: 0.32 })); }}>Flat</button><button type="button" className={inputClass} onClick={() => { invalidate(); setLayout(pretty(groundTemplate)); }}>Reset ground · horizon 0.40</button></div>
        <label className="text-xs">Layout JSON<textarea className={`${inputClass} mt-1 w-full font-mono`} rows={15} value={layout} onChange={e => { invalidate(); setLayout(e.target.value); }} /></label>
        <p className="text-xs text-muted-foreground">Sửa horizonY, standingRegions, referenceFoot/Height, nearFoot/farFoot. Đặt confirmed=true sau khi đã xem và xác nhận ground layout để xuất.</p>
        <label className="text-sm"><input type="checkbox" checked={draft.debug} onChange={e => update({ debug: e.target.checked })} /> Hiện horizon, vùng đứng, chân và bounding box</label>
      </section>
      <button type="button" onClick={preview} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{pending ? "Đang kiểm tra asset…" : "Kiểm tra và xem showcase"}</button>
    </fieldset>
    <section className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-5 xl:self-start">
      {error && <p role="alert" className="whitespace-pre-wrap break-words rounded-xl border border-destructive p-4 text-sm text-destructive">{error}</p>}
      {resolved ? <><Player component={AnimationShowcase} inputProps={resolved} durationInFrames={SHOWCASE.frames} compositionWidth={SHOWCASE.width} compositionHeight={SHOWCASE.height} fps={SHOWCASE.fps} controls style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12 }} />
        <ul className="space-y-1 text-sm text-muted-foreground">{resolved.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        <button type="button" className={`${inputClass} self-start`} onClick={download}>Tải draft đã resolve để render</button>
      </> : <div className="flex aspect-video items-center justify-center rounded-xl border bg-muted p-6 text-center text-sm text-muted-foreground">Chọn asset và kiểm tra để xem 5 shot / 20 giây.<br />Draft chỉ nằm trong lab; phim hiện tại không thay đổi.</div>}
      <p className="text-xs text-muted-foreground">Thứ tự cố định: Background → Midground → Foreground. Clip im lặng; walk/run là bob từ ảnh, không sinh cử động tay chân.</p>
    </section>
  </div>;
}
