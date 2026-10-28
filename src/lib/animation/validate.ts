import { projectCamera, spriteCorners } from "./geometry";
import { evaluateGroundScale } from "./ground";
import { actorAt, evaluateCamera, evaluateMotion, identity, stateAtFrame } from "./motion";
import { SHOWCASE, type LayerItem, type ShowcaseProps } from "./types";

export function itemPose(item: LayerItem, props: ShowcaseProps, frame: number) {
  const clip = item.clips.find(c => frame >= c.from && frame < c.to);
  return clip ? evaluateMotion(clip.kind, frame - clip.from, SHOWCASE.fps, props.draft.intensity, `v1:${item.id}`, clip.to - clip.from) : identity();
}
export function mainState(props: ShowcaseProps, frame: number) {
  return stateAtFrame(props.states, frame);
}
export function validateShowcase(props: ShowcaseProps, forExport = false): string[] {
  const issues = new Set<string>(), d = props.draft;
  if (forExport && d.layout.mode === "ground_plane" && !d.layout.confirmed) issues.add("Cần xác nhận horizon, vùng đứng và tỷ lệ trước khi xuất ground_plane");
  const bounds = (id: string, frame: number, corners: { x: number; y: number }[]) => {
    if (corners.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0.01 || p.x > 0.99 || p.y < 0.01 || p.y > 0.99)) issues.add(`${id}: vượt safe area ở frame ${frame}; chỉnh vị trí/anchor/height/intensity`);
  };
  for (let frame = 0; frame < SHOWCASE.frames; frame++) {
    try {
      const camera = evaluateCamera(frame, d.intensity, "showcase:v1");
      const screen = (points: { x: number; y: number }[]) => points.map(p => projectCamera(p, camera));
      const actor = actorAt(d, frame), state = mainState(props, frame), asset = props.assets[`${d.characterRef}.${state}`];
      if (!asset) { issues.add(`Thiếu ảnh state ${state}`); break; }
      const height = evaluateGroundScale(actor.foot, d.layout);
      bounds("main", frame, screen(spriteCorners(asset, actor.foot, height, d.anchorByState[state] ?? { x: 0.5, y: 1 }, actor.pose)));
      for (const item of [...d.midgroundItems, ...d.foregroundProps]) {
        const image = props.assets[item.ref];
        if (!image) { issues.add(`Thiếu asset ${item.ref}`); continue; }
        bounds(item.id, frame, screen(spriteCorners(image, item, item.height, item.anchor, itemPose(item, props, frame), item.flip)));
      }
    } catch (error) { issues.add(`Frame ${frame}: ${error instanceof Error ? error.message : String(error)}`); }
    if (issues.size >= 8) break;
  }
  return [...issues];
}
