import { Easing, interpolate, random, spring } from "remotion";
import type { Draft, Intensity, MotionKind, Pose } from "./types";

export const identity = (): Pose => ({ offsetX: 0, offsetY: 0, rotateDeg: 0, scaleX: 1, scaleY: 1, opacity: 1 });
const strength = { subtle: 0.5, normal: 1, strong: 1.5 };
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export function evaluateMotion(kind: MotionKind, frame: number, fps: number, intensity: Intensity, seed: string, duration = 120): Pose {
  const pose = identity();
  if (frame <= 0 || frame >= duration - 1) return pose;
  const t = frame / (duration - 1), envelope = Math.sin(Math.PI * t) ** 2, a = strength[intensity];
  const cycle = Math.sin(frame / fps * Math.PI * 2 * (kind === "run_bob" ? 4 : 2));
  if (kind === "idle_bob") { pose.scaleY += envelope * 0.012 * a * cycle; }
  if (kind === "walk_bob" || kind === "run_bob") {
    pose.offsetY = -Math.abs(cycle) * envelope * a * (kind === "run_bob" ? 0.055 : 0.025);
    pose.rotateDeg = cycle * envelope * a * (kind === "run_bob" ? 5 : 2);
  }
  if (kind === "hop") pose.offsetY = -0.28 * a * Math.sin(Math.PI * t) ** 2;
  if (kind === "recoil") {
    const s = spring({ frame, fps, durationInFrames: duration, config: { damping: 12, stiffness: 150 } });
    pose.offsetX = -0.12 * a * s * envelope;
    pose.rotateDeg = -12 * a * s * envelope;
  }
  if (kind === "squash") { pose.scaleX += 0.28 * a * envelope; pose.scaleY -= 0.22 * a * envelope; }
  // Seed is reserved by presetVersion; motion is pure even when rendered out of order.
  void seed;
  return pose;
}
export function evaluateCamera(frame: number, intensity: Intensity, seed: string) {
  if (frame < 360 || frame >= 480) return { zoom: 1, fx: 0.5, fy: 0.5, x: 0, y: 0 };
  const f = frame - 360;
  const shake = f >= 55 && f < 80 ? Math.sin(Math.PI * (f - 55) / 24) ** 2 * 12 * strength[intensity] : 0;
  return { zoom: interpolate(f, [0, 119], [1, 1.12], clamp), fx: interpolate(f, [0, 119], [0.5, 0.6], clamp), fy: 0.7,
    x: (random(`${seed}:x:${Math.floor(f / 2)}`) * 2 - 1) * shake, y: (random(`${seed}:y:${Math.floor(f / 2)}`) * 2 - 1) * shake };
}
export function actorAt(draft: Draft, frame: number) {
  const shot = Math.min(4, Math.floor(frame / 120)), f = frame % 120;
  let foot = { ...draft.layout.referenceFoot };
  let kind: MotionKind = "idle_bob", local = f, duration = 120;
  if (shot === 1) {
    foot.x += interpolate(f, [0, 119], [-0.12, 0.12], { ...clamp, easing: Easing.linear });
    kind = f < 60 ? "walk_bob" : "run_bob"; local = f % 60; duration = 60;
  }
  if (shot === 2) { kind = f < 40 ? "hop" : f < 80 ? "recoil" : "squash"; local = f % 40; duration = 40; }
  if (shot === 4 && draft.layout.mode === "ground_plane") {
    const l = draft.layout;
    foot = { x: interpolate(f, [0, 119], [l.farFoot.x, l.nearFoot.x], clamp), y: interpolate(f, [0, 119], [l.farFoot.y, l.nearFoot.y], clamp) };
  }
  return { foot, pose: shot === 3 || shot === 4 ? identity() : evaluateMotion(kind, local, 30, draft.intensity, "main:v1", duration), kind, shot };
}
export function stateAtFrame(states: string[], frame: number) {
  const base = ["idle", "base", ...states].find(s => states.includes(s))!;
  if (frame < 60) return base;
  if (frame < 120) return ["surprised", "happy"].find(s => states.includes(s)) ?? base;
  if (frame < 240) return states.includes("walk") ? "walk" : base;
  return base;
}
