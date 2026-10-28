import type { ImageAsset, Point, Pose } from "./types";
import { SHOWCASE } from "./types";

export function projectCamera(point: Point, camera: { zoom: number; fx: number; fy: number; x: number; y: number }): Point {
  return { x: (point.x - camera.fx) * camera.zoom + camera.fx + camera.x / SHOWCASE.width,
    y: (point.y - camera.fy) * camera.zoom + camera.fy + camera.y / SHOWCASE.height };
}

export function spriteCorners(asset: ImageAsset, foot: Point, height: number, anchor: Point, pose: Pose, flip = false): Point[] {
  const h = height * SHOWCASE.height, w = h * asset.width / asset.height;
  const angle = pose.rotateDeg * Math.PI / 180;
  return [[0, 0], [1, 0], [1, 1], [0, 1]].map(([cx, cy]) => {
    const x = (cx - anchor.x) * w * pose.scaleX * (flip ? -1 : 1), y = (cy - anchor.y) * h * pose.scaleY;
    return { x: foot.x + (x * Math.cos(angle) - y * Math.sin(angle) + pose.offsetX * h) / SHOWCASE.width,
      y: foot.y + (x * Math.sin(angle) + y * Math.cos(angle) + pose.offsetY * h) / SHOWCASE.height };
  });
}
