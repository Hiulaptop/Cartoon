import { Img, staticFile } from "remotion";
import type { ImageAsset, Point, Pose, ShowcaseProps } from "@/lib/animation/types";
import { SHOWCASE } from "@/lib/animation/types";

export function imageSrc(asset: ImageAsset, mode: ShowcaseProps["assetMode"]) {
  return mode === "static" ? staticFile(asset.path) : `/api/files/${asset.path}`;
}
export function AnimatedSprite({ asset, mode, foot, height, anchor, pose, flip = false }: {
  asset: ImageAsset; mode: ShowcaseProps["assetMode"]; foot: Point; height: number; anchor: Point; pose: Pose; flip?: boolean;
}) {
  const h = height * SHOWCASE.height, w = h * asset.width / asset.height;
  return <div style={{ position: "absolute", left: foot.x * SHOWCASE.width, top: foot.y * SHOWCASE.height,
    transform: `translate(${pose.offsetX * h}px,${pose.offsetY * h}px) rotate(${pose.rotateDeg}deg) scale(${pose.scaleX},${pose.scaleY})`, opacity: pose.opacity }}>
    <div style={{ transform: `scaleX(${flip ? -1 : 1})` }}>
      <Img src={imageSrc(asset, mode)} style={{ position: "absolute", left: -anchor.x * w, top: -anchor.y * h, width: w, height: h, maxWidth: "none", maxHeight: "none" }} />
    </div>
  </div>;
}
