import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

export type BostonProps = { images: Record<string, { path: string; width: number; height: number }> };
const W = 1920, H = 1080;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const horizonY = 0.616;
const workerHeight = (footY: number) => 0.34 * (footY - horizonY) / (0.865 - horizonY);
const workers = [{ x: 0.50, y: 0.865, height: workerHeight(0.865) }, { x: 0.61, y: 0.825, height: workerHeight(0.825) }];
export const SCENE_LAYOUT = { horizonY, layerOrder: ["static_background", "static_midground", "dynamic_foreground"], foregroundAlwaysInFront: true, pierRect: { left: -35, top: 800, width: 1370, height: 340 }, groundPolygonPixels: [[-35, 895], [396, 800], [1335, 859], [989, 1026]], workers, workerReferenceHeight: 0.34, workerReferenceFootY: 0.865, punoFootY: 0.85, punoHeight: 0.255, anchor: "bottom-center", seed: "deterministic-no-random", crateCount: 4 };
export const throws = [0, 1, 2, 3].map((index) => ({ start: 300 + index * 120, worker: index % 2, groundX: 0.31 + index * 0.065, groundY: 0.89, hitX: 0.79 + index * 0.027, hitY: 0.92 - (index % 2) * 0.025 }));

function Sprite({ images, name, x, y, height, rotation = 0, scale = 1, opacity = 1, flip = false }: BostonProps & { name: string; x: number; y: number; height: number; rotation?: number; scale?: number; opacity?: number; flip?: boolean }) {
  const image = images[name];
  if (!image) throw new Error(`Missing sprite ${name}`);
  const h = height * H, w = h * image.width / image.height;
  return <div style={{ position: "absolute", left: x * W, top: y * H, width: 0, height: 0, transform: `rotate(${rotation}deg) scale(${scale})`, opacity }}>
    <Img src={staticFile(image.path)} style={{ position: "absolute", width: w, height: h, left: -w / 2, top: -h, maxWidth: "none", maxHeight: "none", transform: flip ? "scaleX(-1)" : undefined }} />
  </div>;
}

function workerLean(local: number) { return interpolate(local, [0, 20, 36, 55, 100], [0, -6, 11, 3, 0], clamp); }
function handAnchor(workerIndex: number, local: number) {
  const worker = workers[workerIndex], angle = workerLean(local) * Math.PI / 180;
  const dx = 0.06 * W, dy = -worker.height * 0.64 * H;
  return { x: worker.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) / W, y: worker.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) / H };
}
function cratePose(frame: number, index: number) {
  const event = throws[index], local = frame - event.start;
  const hand = handAnchor(event.worker, Math.min(36, Math.max(0, local)));
  if (local < 0) return { x: event.groundX, y: event.groundY, rotation: 0, opacity: 1 };
  if (local < 24) {
    const p = interpolate(local, [0, 24], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    return { x: event.groundX + (hand.x - event.groundX) * p, y: event.groundY + (hand.y - event.groundY) * p, rotation: -12 * p, opacity: 1 };
  }
  if (local < 36) return { ...hand, rotation: -12, opacity: 1 };
  const p = Math.max(0, Math.min(1, (local - 36) / 54));
  return { x: hand.x + (event.hitX - hand.x) * p, y: hand.y + (event.hitY - hand.y) * p - 0.23 * 4 * p * (1 - p), rotation: -12 + 240 * p, opacity: local < 90 ? 1 : 0 };
}

export function BostonScene({ images }: BostonProps) {
  const frame = useCurrentFrame();
  const arrival = interpolate(frame, [35, 80], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const walk = interpolate(frame, [180, 290], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const walking = frame >= 180 && frame < 290;
  const punoX = 0.13 + walk * 0.10;
  const punoBob = walking ? Math.abs(Math.sin((frame - 180) * Math.PI / 11)) * 0.009 : Math.sin(frame / 18) * 0.001;
  const portalOpacity = interpolate(frame, [0, 18, 105, 175], [0, 1, 1, 0], clamp);
  const arrivalFlash = interpolate(frame, [35, 45, 65], [0, 0.24, 0], clamp);
  return <AbsoluteFill style={{ backgroundColor: "#bde4ed", overflow: "hidden" }}>
    {/* Layer1: static background, cover fills all16:9 edges without stretching. */}
    <AbsoluteFill><Img src={staticFile(images.background.path)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} /></AbsoluteFill>
    {/* Layer2: independently generated static water, merchant ship and dock. */}
    <AbsoluteFill>
      <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "29%", overflow: "hidden" }}>
        <Img src={staticFile(images.water.path)} style={{ position: "absolute", left: -20, top: -20, width: "calc(100% + 40px)", height: "calc(100% + 40px)", objectFit: "cover", objectPosition: "top center" }} />
      </div>
      <Sprite images={images} name="ship" x={0.80} y={0.76} height={0.47} />
      <div style={{ position: "absolute", left: -35, top: 800, width: 1370, height: 340 }}>
        <Img src={staticFile(images.pier.path)} style={{ width: "100%", height: "100%", objectFit: "fill" }} />
      </div>
    </AbsoluteFill>
    {/* Layer3: every animated character/prop remains above midground. */}
    <AbsoluteFill>
      {workers.map((worker, index) => <div key={`shadow${index}`} style={{ position: "absolute", left: worker.x * W - 50, top: worker.y * H - 10, width: 100, height: 19, borderRadius: "50%", background: "#30241b", opacity: 0.18 }} />)}
      {workers.map((worker, index) => {
        const active = throws.find(event => event.worker === index && frame >= event.start && frame < event.start + 105);
        const local = active ? frame - active.start : -1;
        const throwing = local >= 25 && local < 67;
        const lean = active ? workerLean(local) : 0;
        return <Sprite key={index} images={images} name={throwing ? "worker_angry" : "worker"} {...worker} rotation={lean} />;
      })}
      {throws.map((event, index) => frame < event.start && <Sprite key={`ground${index}`} images={images} name="crate" x={event.groundX} y={event.groundY} height={0.09} />)}
      {portalOpacity > 0 && <Sprite images={images} name="portal" x={0.13} y={0.86} height={0.43} opacity={portalOpacity} scale={0.85 + Math.sin(frame / 10) * 0.03} />}
      {arrival > 0 && <>
        <div style={{ position: "absolute", left: punoX * W - 58, top: 0.85 * H - 10, width: 116, height: 22, borderRadius: "50%", background: "#30241b", opacity: arrival * 0.19 }} />
        <Sprite images={images} name="puno" x={punoX} y={0.85 - punoBob} height={0.255} opacity={arrival} scale={arrival * (frame > 780 ? 1 + Math.sin((frame - 780) / 13) * 0.025 : 1)} rotation={walking ? Math.sin(frame / 7) * 4 : 0} flip />
      </>}
      {throws.map((event, index) => frame >= event.start && <Sprite key={`air${index}`} images={images} name="crate" {...cratePose(frame, index)} height={0.09} />)}
      {throws.map((event, index) => {
        const t = frame - event.start - 90;
        if (t < 0 || t >= 28) return null;
        const opacity = interpolate(t, [0, 3, 15, 28], [0, 1, 0.8, 0], clamp);
        const scale = interpolate(t, [0, 10, 28], [0.3, 1.12, 0.9], clamp);
        return <Sprite key={`splash${index}`} images={images} name="splash" x={event.hitX} y={event.hitY + 0.025} height={0.18} opacity={opacity} scale={scale} />;
      })}
    </AbsoluteFill>
    {arrivalFlash > 0 && <AbsoluteFill style={{ backgroundColor: "#dcffff", opacity: arrivalFlash }} />}
  </AbsoluteFill>;
}
