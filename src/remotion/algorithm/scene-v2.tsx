import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";

import type { AnimationSceneV2, MarkState } from "@/lib/algorithm/animation/schema";
import { simulateScene, stateAt, type CueWindow } from "@/lib/algorithm/animation/simulate";

import { PALETTE } from "./palette";

// Cảnh V2 (spec animation-engine §6): mảng ô + con trỏ + đánh dấu, mọi chuyển động tính tất định từ frame.
// Mã trong bundle Remotion: không import DB, pg, sharp, fs.

const PAD = 72;
const ROW_WIDTH = 1080 - PAD * 2;
const GAP = 8;
const ARRAY_TOP = 400;
const MAX_CELL = 120;

type Look = { bg: string; border: string; text: string };
const LOOKS: Record<MarkState | "none", Look> = {
  none: { bg: PALETTE.surface, border: PALETTE.line, text: PALETTE.ink },
  considering: { bg: PALETTE.focus, border: PALETTE.progress, text: PALETTE.ink },
  valid: { bg: "#BBF7D0", border: PALETTE.valid, text: PALETTE.ink },
  rejected: { bg: "#FECACA", border: PALETTE.reject, text: PALETTE.inkMuted },
  found: { bg: PALETTE.progress, border: "#C2410C", text: PALETTE.ink },
};

function channels(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function mix(from: string, to: string, t: number): string {
  const [r1, g1, b1] = channels(from);
  const [r2, g2, b2] = channels(to);
  const at = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${at(r1, r2)}, ${at(g1, g2)}, ${at(b1, b2)})`;
}

const lookOf = (mark: MarkState | null): Look => LOOKS[mark ?? "none"];

export const SceneV2: React.FC<{ scene: AnimationSceneV2; windows: CueWindow[] }> = ({ scene, windows }) => {
  const localFrame = useCurrentFrame();
  const sim = React.useMemo(() => simulateScene(scene, windows), [scene, windows]);
  const visual = stateAt(sim, scene.from + localFrame);
  const count = visual.cells.length;
  const cell = count > 0 ? Math.min(MAX_CELL, Math.floor((ROW_WIDTH - GAP * (count - 1)) / count)) : MAX_CELL;
  const pitch = cell + GAP;
  const labels = scene.array?.labels;
  // Cảnh không có mảng: ghi chú ngay dưới tiêu đề, code lùi xuống để không che ghi chú.
  const noteTop = count > 0 ? ARRAY_TOP + cell + 170 : 290;
  const codeTop = count > 0 ? ARRAY_TOP + cell + 240 : 410;

  // Con trỏ cùng một ô xếp lệch theo tầng để nhãn không che nhau.
  const levels = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const pointer of [...visual.pointers].sort((left, right) => left.name.localeCompare(right.name))) {
    const key = `${pointer.side}:${Math.round(pointer.slot)}`;
    const level = seen.get(key) ?? 0;
    seen.set(key, level + 1);
    levels.set(pointer.name, level);
  }

  return (
    <AbsoluteFill style={{ background: PALETTE.paper, color: PALETTE.ink, padding: PAD, fontFamily: "Arial, sans-serif" }}>
      <div style={{ width: 120, height: 10, borderRadius: 5, background: PALETTE.progress, marginBottom: 28 }} />
      <div style={{ fontSize: 58, fontWeight: 700, lineHeight: 1.15 }}>{scene.title}</div>

      {visual.ranges.map((range) => (
        <div key={`${range.from}:${range.to}:${range.state}`} style={{
          position: "absolute", left: PAD + range.from * pitch - 8, top: ARRAY_TOP - 14, width: (range.to - range.from + 1) * pitch - GAP + 16, height: cell + 28,
          borderRadius: 22, background: lookOf(range.state).bg, border: `4px dashed ${lookOf(range.state).border}`, opacity: 0.55 * range.opacity,
        }} />
      ))}

      {visual.cells.map((item) => {
        const from = lookOf(item.prevMark);
        const to = lookOf(item.mark);
        const background = mix(from.bg, to.bg, item.markMix);
        const border = mix(from.border, to.border, item.markMix);
        const found = item.mark === "found";
        const fontSize = Math.min(44, cell * 0.4, ((cell - 14) / Math.max(1, item.value.length)) * 1.5);
        return (
          <div key={item.id} style={{
            position: "absolute", left: PAD + item.slot * pitch, top: ARRAY_TOP + item.lift * cell * 0.7, width: cell, height: cell,
            display: "grid", placeItems: "center", borderRadius: 18, background, border: `5px solid ${border}`, color: to.text,
            fontSize, fontWeight: 700, transform: `scale(${1 + 0.14 * item.pulse})`, zIndex: item.lift !== 0 ? 5 : 1,
            boxShadow: found ? `0 0 ${24 * item.markMix}px ${PALETTE.progress}` : "none", opacity: item.mark === "rejected" ? 0.7 + 0.3 * (1 - item.markMix) : 1,
          }}>{item.value}</div>
        );
      })}

      {count > 0 && Array.from({ length: count }, (_, index) => (
        <div key={index} style={{ position: "absolute", left: PAD + index * pitch, top: ARRAY_TOP + cell + 8, width: cell, textAlign: "center", fontSize: 24, color: PALETTE.inkMuted }}>
          {labels?.[index] ?? index}
        </div>
      ))}

      {visual.pointers.map((pointer) => {
        const level = levels.get(pointer.name) ?? 0;
        const below = pointer.side === "below";
        const top = below ? ARRAY_TOP + cell + 46 + level * 52 : ARRAY_TOP - 58 - level * 52;
        return (
          <div key={pointer.name} style={{ position: "absolute", left: PAD + pointer.slot * pitch, top, width: cell, display: "flex", flexDirection: below ? "column" : "column-reverse", alignItems: "center", opacity: pointer.opacity }}>
            <div style={{ fontSize: 22, lineHeight: 1, color: PALETTE.progress }}>{below ? "▲" : "▼"}</div>
            <div style={{ padding: "4px 14px", borderRadius: 999, background: PALETTE.ink, color: PALETTE.paper, fontSize: 28, fontWeight: 700 }}>{pointer.name}</div>
          </div>
        );
      })}

      {visual.notes.map((note) => (
        <div key={note.text} style={{
          position: "absolute", left: PAD, width: ROW_WIDTH, top: noteTop, textAlign: "center", opacity: note.opacity,
          fontSize: 34, fontWeight: 600, color: PALETTE.ink,
        }}>
          <span style={{ display: "inline-block", padding: "8px 22px", borderRadius: 14, background: PALETTE.surface, border: `3px solid ${PALETTE.line}` }}>{note.text}</span>
        </div>
      ))}

      {scene.code && (
        <pre style={{
          position: "absolute", left: PAD, width: ROW_WIDTH, top: codeTop, maxHeight: 1480 - codeTop, overflow: "hidden", margin: 0,
          whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: 30, borderRadius: 18, boxSizing: "border-box",
          background: PALETTE.surface, border: `3px solid ${PALETTE.line}`, borderLeft: `10px solid ${PALETTE.valid}`, color: PALETTE.ink, fontSize: 27, lineHeight: 1.4,
        }}>{scene.code}</pre>
      )}
    </AbsoluteFill>
  );
};
