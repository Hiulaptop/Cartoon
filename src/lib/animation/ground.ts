import type { Layout, Point } from "./types";

const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSegment = (a: Point, b: Point, p: Point) => Math.abs(cross(a, b, p)) < 1e-9 && p.x >= Math.min(a.x, b.x) - 1e-9 && p.x <= Math.max(a.x, b.x) + 1e-9 && p.y >= Math.min(a.y, b.y) - 1e-9 && p.y <= Math.max(a.y, b.y) + 1e-9;
function intersects(a: Point, b: Point, c: Point, d: Point) {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}
export function polygonIssue(points: Point[]): string | null {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (Math.hypot(a.x - b.x, a.y - b.y) < 1e-6) return "cạnh có độ dài bằng 0";
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return "polygon tự cắt/chạm";
    }
  }
  return Math.abs(area) < 1e-6 ? "polygon không có diện tích" : null;
}
export function pointInPolygon(p: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (onSegment(a, b, p)) return true;
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function evaluateGroundScale(foot: Point, layout: Layout, relativeHeight = 1) {
  let height = layout.referenceHeight * relativeHeight;
  if (layout.mode === "ground_plane") {
    const dRef = layout.referenceFoot.y - layout.horizonY;
    if (dRef <= layout.epsilon || foot.y - layout.horizonY <= layout.epsilon) throw new Error("Điểm chân không ở trước horizon + epsilon");
    if (!layout.standingRegions.some(p => pointInPolygon(foot, p))) throw new Error("Đường đi rời vùng đứng");
    height *= (foot.y - layout.horizonY) / dRef;
  }
  if (!Number.isFinite(height) || height < 0.1 || height > 1.2) throw new Error("Chiều cao ngoài khoảng 0.1–1.2; hãy chỉnh bố cục");
  return height;
}
