import { interpolate, Easing } from "remotion";

import type { SceneCharacter, SceneDsl } from "@/lib/scene/schema";

export const TALK_FRAMES = 5;

// Trạng thái ảnh của nhân vật tại frame: khóa states gần nhất, ghi đè bằng talk_a/talk_b khi đang nói.
export function stateAt(c: SceneCharacter, dialogue: SceneDsl["dialogue"], frame: number, has: (state: string) => boolean): string {
  const keyed = [...c.states].reverse().find((s) => s.at <= frame)?.state ?? c.states[0].state;
  const line = dialogue.find((d) => d.speaker === c.id && frame >= d.from && frame < d.to);
  if (line && has("talk_a") && has("talk_b")) return Math.floor((frame - line.from) / TALK_FRAMES) % 2 === 0 ? "talk_a" : "talk_b";
  return keyed;
}

// Vị trí chân nhân vật tại frame: đi tuần tự qua các moves, mượt (ease in-out).
export function positionAt(c: SceneCharacter, frame: number): { x: number; y: number } {
  let pos = { x: c.x, y: c.y };
  for (const m of [...c.moves].sort((a, b) => a.from - b.from)) {
    if (frame < m.from) break;
    const t = Math.min(1, (frame - m.from) / (m.to - m.from));
    const e = Easing.inOut(Easing.ease)(t);
    pos = { x: pos.x + (m.x - pos.x) * e, y: pos.y + (m.y - pos.y) * e };
    if (t < 1) break;
  }
  return pos;
}

export function cameraAt(camera: SceneDsl["camera"], frame: number): { zoom: number; fx: number; fy: number } {
  if (camera.length === 1) return camera[0];
  const at = camera.map((k) => k.at);
  const lerp = (pick: (k: SceneDsl["camera"][number]) => number) =>
    interpolate(frame, at, camera.map(pick), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { zoom: lerp((k) => k.zoom), fx: lerp((k) => k.fx), fy: lerp((k) => k.fy) };
}

// Độ mờ do chuyển cảnh `fade` (1 = rõ hoàn toàn).
export function fadeAt(t: SceneDsl["transition"], frame: number, duration: number): number {
  const fadeIn = t.in === "fade" ? interpolate(frame, [0, t.frames], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const fadeOut = t.out === "fade" ? interpolate(frame, [duration - t.frames, duration], [1, 0], { extrapolateLeft: "clamp" }) : 1;
  return Math.min(fadeIn, fadeOut);
}
