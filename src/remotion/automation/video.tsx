import React, { useEffect, useState } from "react";
import { AbsoluteFill, Html5Audio, Sequence, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame } from "remotion";
import type { RenderInput } from "@/lib/automation/contracts";
import { positionAt, stateAt } from "@/lib/automation/visual";
import { wrapCaption } from "@/lib/automation/timeline";

const ink = "#142a43";
function ObjectIcon({ type }: { type: string }) {
  return <svg width="38" height="38" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{type === "person" ? <><circle cx="20" cy="10" r="6" /><path d="M8 36v-8a12 12 0 0 1 24 0v8M20 22v14" /></> : type === "parcel" ? <><path d="m4 12 16-8 16 8v20l-16 6-16-6ZM4 12l16 8 16-8M20 20v18M12 8l16 8" /></> : type === "router" ? <><rect x="4" y="21" width="32" height="14" rx="3" /><path d="M10 21V8M30 21V8M10 29h4M20 29h4M11 6q9-8 18 0" /></> : type === "server" ? <><rect x="7" y="3" width="26" height="34" rx="3" /><path d="M7 14h26M7 25h26M12 8h3M12 20h3M12 31h3" /></> : type === "desk" ? <><path d="M3 18h34M8 18v19M32 18v19M12 18V7h16v11" /></> : <><rect x="3" y="4" width="34" height="26" rx="3" /><path d="M12 37h16M20 30v7" /></>}</svg>;
}
function FontGate({ input, title }: { input?: RenderInput; title?: string }) {
  const [handle] = useState(() => delayRender("Automation local Geist font"));
  useEffect(() => {
    const face = new FontFace("AutomationGeist", `url(${staticFile("font.ttf")})`);
    face.load().then((font) => {
      document.fonts.add(font);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Không đo được font layout");
      const fits = (value: string, size: number, width: number, lines: number) => {
        context.font = `${size}px AutomationGeist`;
        let current = "", count = 1;
        for (const word of value.split(/\s+/)) {
          if (context.measureText(word).width > width) throw new Error(`Từ quá rộng cho layout: ${word}`);
          const next = current ? `${current} ${word}` : word;
          if (context.measureText(next).width > width) { count++; current = word; } else current = next;
        }
        if (count > lines) throw new Error(`Chữ vượt vùng layout: ${value.slice(0, 70)}`);
      };
      if (title) fits(title, 105, 1600, 5);
      if (input) for (const scene of input.storyboard.scenes) {
        fits(scene.title, 54, 1728, 1);
        fits(scene.assumptions.length ? `Giả định mô hình: ${scene.assumptions.join(" · ")}` : "", 24, 1728, 1);
        for (const object of scene.objects) fits(object.label, 31, 310, 1);
        for (const cue of scene.cues) {
          for (const line of wrapCaption(cue.text).split("\n")) fits(line, 36, 1672, 1);
          for (const op of cue.operations) {
            if (op.action.op === "callout.show") fits(op.action.text, 24, 310, 2);
            if (op.action.op === "queue.enqueue") fits(`12. ${op.action.label}`, 14, 64, 1);
            if (op.action.op === "counter.set") fits(`${op.action.value} ${op.action.unit}`, 32, 310, 1);
          }
        }
      }
      continueRender(handle);
    }).catch(cancelRender);
  }, [handle, input, title]);
  return null;
}
export function AutomationVideo({ input, preflight = false }: { input: RenderInput; preflight?: boolean }) {
  const frame = useCurrentFrame();
  if (!input.storyboard.scenes.length) return <AbsoluteFill style={{ background: "#f7f5ef" }} />;
  const timed = input.cues.find((cue) => frame >= cue.from && frame < cue.from + cue.duration) ?? input.cues.at(-1);
  const scene = input.storyboard.scenes.find((item) => item.id === timed?.sceneId) ?? input.storyboard.scenes[0];
  const cueIndex = scene.cues.findIndex((cue) => cue.id === timed?.cueId);
  const progress = timed ? Math.min(1, (frame - timed.from) / timed.duration) : 0;
  const objects = stateAt(scene, Math.max(0, cueIndex), progress);
  const currentCue = scene.cues[Math.max(0, cueIndex)];
  return <AbsoluteFill style={{ background: "#f7f5ef", color: ink, fontFamily: "AutomationGeist", padding: 96 }}>
    <FontGate input={input} />
    <div style={{ fontSize: 22, letterSpacing: 5, textTransform: "uppercase" }}>Cơ chế phía sau · {scene.layout}</div>
    <h1 style={{ margin: "20px 0", fontSize: 54, fontWeight: 400, maxWidth: 1728 }}>{scene.title}</h1>
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      {scene.layout === "compare" && <g><line x1={960} y1={220} x2={960} y2={760} stroke={ink} strokeWidth={2} strokeDasharray="6 8" /><text x={440} y={230} fontSize={22} fill={ink}>Phương án A</text><text x={1300} y={230} fontSize={22} fill={ink}>Phương án B</text></g>}
      {currentCue.operations.filter((op) => op.action.op === "flow.emit" && progress >= op.from && progress <= op.to).map((op, i) => {
        if (op.action.op !== "flow.emit") return null;
        const source = objects.find((object) => object.id === op.action.target);
        const target = objects.find((object) => object.id === (op.action.op === "flow.emit" ? op.action.to : ""));
        if (!source || !target) return null;
        const a = positionAt(scene, Math.max(0, cueIndex), progress, source.id), b = positionAt(scene, Math.max(0, cueIndex), progress, target.id);
        const p = (progress - op.from) / Math.max(0.001, op.to - op.from);
        return <g key={i}><line x1={a.x + 180} y1={a.y + 90} x2={b.x + 180} y2={b.y + 90} stroke={ink} strokeWidth={3} strokeDasharray="8 8" /><circle cx={a.x + 180 + (b.x - a.x) * p} cy={a.y + 90 + (b.y - a.y) * p} r={13} fill={ink} stroke="#fff" strokeWidth={3} /></g>;
      })}
    </svg>
    {objects.filter((object) => object.visible).map((object) => {
      const pos = positionAt(scene, Math.max(0, cueIndex), progress, object.id);
      return <div key={object.id} style={{ position: "absolute", left: pos.x, top: pos.y, width: 360, minHeight: 178, boxSizing: "border-box", border: `${object.highlighted ? 5 : 2}px solid ${ink}`, borderRadius: 22, padding: 20, background: "#fff", boxShadow: object.highlighted ? "8px 8px 0 #d5dde4" : undefined }}>
        <div style={{ fontSize: 21, display: "flex", alignItems: "center", gap: 12 }}><ObjectIcon type={object.type} />{object.highlighted ? "Đang xét" : ""}</div>
        <div style={{ fontSize: 31, lineHeight: 1.25, marginTop: 12, whiteSpace: "nowrap" }}>{object.label}</div>
        {object.counter && <div style={{ fontSize: 32, fontWeight: 400 }}>{object.counter}</div>}
        {!!object.queue.length && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 12 }}>{object.queue.map((label, i) => <span key={i} style={{ fontSize: 14, border: `1px solid ${ink}`, padding: 3, width: 72, boxSizing: "border-box", overflowWrap: "anywhere" }}>{i + 1}. {label}</span>)}</div>}
        {object.callout && <div style={{ marginTop: 12, fontSize: 24 }}>{object.callout}</div>}
      </div>;
    })}
    {!!scene.assumptions.length && <div style={{ position: "absolute", left: 96, right: 96, bottom: 240, fontSize: 24, whiteSpace: "nowrap" }}>Giả định mô hình: {scene.assumptions.join(" · ")}</div>}
    <div style={{ position: "absolute", bottom: 70, left: 96, right: 96, textAlign: "center", fontSize: 36, lineHeight: 1.35, padding: "18px 28px", whiteSpace: "pre-line", borderTop: `2px solid ${ink}` }}>{timed ? wrapCaption(timed.text) : ""}</div>
    {!preflight && input.cues.map((cue) => <Sequence key={cue.cueId} from={cue.from} durationInFrames={cue.duration}><Html5Audio src={staticFile(cue.filePath)} /></Sequence>)}
  </AbsoluteFill>;
}
export function AutomationThumbnail({ title }: { title: string }) {
  return <AbsoluteFill style={{ background: "#f7f5ef", color: ink, padding: 120, justifyContent: "center", fontFamily: "AutomationGeist" }}><FontGate title={title} /><div style={{ fontSize: 30, letterSpacing: 5 }}>CƠ CHẾ PHÍA SAU</div><h1 style={{ fontSize: 105, fontWeight: 400, lineHeight: 1.1, maxWidth: 1600 }}>{title}</h1><div style={{ width: 240, height: 12, background: ink }} /></AbsoluteFill>;
}
