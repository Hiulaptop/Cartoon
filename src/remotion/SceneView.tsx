import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";

import { assetKey, defaultState, parseRef } from "@/lib/scene/refs";
import { HEIGHT, WIDTH, type ResolvedAsset, type ResolvedAssets, type SceneDsl, type SceneItem } from "@/lib/scene/schema";

import { cameraAt, fadeAt, positionAt, stateAt } from "./helpers";

export type SceneViewProps = {
  dsl: SceneDsl;
  assets: ResolvedAssets;
  // "url": Player trong app (đọc qua /api/files). "static": renderer (file nằm trong publicDir của bundle, M6).
  assetMode: "url" | "static";
};

const src = (mode: SceneViewProps["assetMode"], path: string) => (mode === "static" ? staticFile(path) : `/api/files/${path}`);

function lookup(assets: ResolvedAssets, raw: string, state?: string): ResolvedAsset | undefined {
  const ref = parseRef(raw);
  if (!ref) return undefined;
  return assets[assetKey(ref.name, state ?? ref.state ?? defaultState(ref.kind))];
}

// Đặt ảnh theo tâm-chân: (x, y) là tâm ngang và đáy ảnh, height theo chiều cao khung.
function Sprite({ asset, mode, x, y, height, flip }: { asset: ResolvedAsset; mode: SceneViewProps["assetMode"]; x: number; y: number; height: number; flip?: boolean }) {
  const h = height * HEIGHT;
  const w = h * (asset.width / asset.height);
  return (
    <Img
      src={src(mode, asset.path)}
      style={{
        position: "absolute",
        left: x * WIDTH - w / 2,
        top: y * HEIGHT - h,
        width: w,
        height: h,
        transform: flip ? "scaleX(-1)" : undefined,
      }}
    />
  );
}

function Floating({ item, assets, mode, frame }: { item: SceneItem; assets: ResolvedAssets; mode: SceneViewProps["assetMode"]; frame: number }) {
  if (frame < item.from || frame >= item.to) return null;
  const asset = lookup(assets, item.ref);
  return asset ? <Sprite asset={asset} mode={mode} x={item.x} y={item.y} height={item.height} /> : null;
}

export const SceneView: React.FC<SceneViewProps> = ({ dsl, assets, assetMode }) => {
  const frame = useCurrentFrame();
  const cam = cameraAt(dsl.camera, frame);
  const bg = lookup(assets, dsl.background.ref);
  const caption = dsl.dialogue.find((d) => frame >= d.from && frame < d.to);
  const characters = [...dsl.characters].sort((a, b) => positionAt(a, frame).y - positionAt(b, frame).y);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill style={{ opacity: fadeAt(dsl.transition, frame, dsl.durationFrames) }}>
        <AbsoluteFill style={{ transform: `scale(${cam.zoom})`, transformOrigin: `${cam.fx * 100}% ${cam.fy * 100}%` }}>
          {bg && <Img src={src(assetMode, bg.path)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          {dsl.effects.map((e) => (
            <Floating key={e.id} item={e} assets={assets} mode={assetMode} frame={frame} />
          ))}
          {dsl.props.map((p) => (
            <Floating key={p.id} item={p} assets={assets} mode={assetMode} frame={frame} />
          ))}
          {characters.map((c) => {
            const state = stateAt(c, dsl.dialogue, frame, (s) => lookup(assets, c.ref, s) !== undefined);
            const asset = lookup(assets, c.ref, state);
            const pos = positionAt(c, frame);
            return asset ? <Sprite key={c.id} asset={asset} mode={assetMode} x={pos.x} y={pos.y} height={c.height} flip={c.flip} /> : null;
          })}
        </AbsoluteFill>
        {caption && (
          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 70 }}>
            <div
              style={{
                maxWidth: 1500,
                padding: "10px 24px",
                borderRadius: 12,
                background: "rgba(0,0,0,0.35)",
                color: "white",
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: 52,
                lineHeight: 1.25,
                textAlign: "center",
                whiteSpace: "pre-wrap",
                textShadow: "-3px 0 black, 3px 0 black, 0 -3px black, 0 3px black",
              }}
            >
              {caption.text}
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
