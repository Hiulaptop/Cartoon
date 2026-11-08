import type { Issue, Scene, Storyboard, Operation } from "./contracts";

export const LAYOUT_VERSION = 1;
export const SAFE_AREA = 96;
export function slotPosition(slot: number, layout: Scene["layout"] = "flow") {
  if (layout === "queue") return { x: 96 + slot * 432, y: 360 };
  if (layout === "callout") return { x: 440 + slot * 680, y: 360 };
  return { x: 96 + (slot % 4) * 432, y: 240 + Math.floor(slot / 4) * 265 };
}
export type ObjectState = { id: string; label: string; type: Scene["objects"][number]["type"]; slot: number; visible: boolean; highlighted: boolean; queue: string[]; counter?: string; callout?: string };
export function initialState(scene: Scene): ObjectState[] { return scene.objects.map((object) => ({ ...object, visible: true, highlighted: false, queue: [] })); }
export function applyOperation(state: ObjectState[], op: Operation) {
  const target = state.find((item) => item.id === op.target);
  if (!target) return;
  switch (op.op) {
    case "object.show": target.visible = true; break;
    case "object.hide": target.visible = false; break;
    case "object.highlight": target.highlighted = true; break;
    case "object.move": target.slot = op.slot; break;
    case "queue.enqueue": target.queue.push(op.label); break;
    case "queue.serve": target.queue.shift(); break;
    case "counter.set": target.counter = `${op.value} ${op.unit}`; break;
    case "callout.show": target.callout = op.text; break;
    case "callout.hide": delete target.callout; break;
  }
}
export function stateAt(scene: Scene, cueIndex: number, progress: number): ObjectState[] {
  const state = initialState(scene);
  scene.cues.forEach((cue, index) => {
    if (index > cueIndex) return;
    for (const op of cue.operations) if (index < cueIndex || progress >= op.from) applyOperation(state, op.action);
  });
  return state;
}
export function positionAt(scene: Scene, cueIndex: number, progress: number, objectId: string) {
  const state = initialState(scene);
  let position = slotPosition(state.find((object) => object.id === objectId)?.slot ?? 0, scene.layout);
  for (let index = 0; index <= cueIndex; index++) {
    for (const op of scene.cues[index]?.operations ?? []) {
      if (index === cueIndex && progress < op.from) continue;
      if (op.action.op === "object.move" && op.action.target === objectId) {
        const target = slotPosition(op.action.slot, scene.layout);
        const fraction = index < cueIndex || op.to <= op.from ? 1 : Math.min(1, (progress - op.from) / (op.to - op.from));
        position = { x: position.x + (target.x - position.x) * fraction, y: position.y + (target.y - position.y) * fraction };
      }
      applyOperation(state, op.action);
    }
  }
  return position;
}
export function checkVisuals(storyboard: Storyboard): Issue[] {
  const issues: Issue[] = [];
  const fail = (path: string, message: string) => issues.push({ code: "layout", path, message, severity: "blocker" });
  for (const scene of storyboard.scenes) {
    const slots = scene.layout === "queue" ? 4 : scene.layout === "callout" ? 2 : 8;
    if (scene.objects.some((object) => object.slot >= slots)) fail(scene.id, `Layout ${scene.layout} chỉ hỗ trợ slot 0–${slots - 1}`);
    if (scene.cues.some((cue) => cue.operations.some((op) => op.action.op === "object.move" && op.action.slot >= slots))) fail(scene.id, "Đích move nằm ngoài preset");
    // Conservative bounds complement the actual font/layout measurement in the renderer.
    for (const object of scene.objects) if (object.label.length > 48) fail(object.id, "Nhãn quá dài cho preset; rút xuống 48 ký tự");
    for (let i = 0; i < scene.cues.length; i++) {
      const cue = scene.cues[i];
      const movingUntil = new Map<string, number>();
      for (const op of cue.operations) if (op.action.op === "object.move") {
        if (op.from < (movingUntil.get(op.action.target) ?? 0)) fail(cue.id, "Hai move của cùng đối tượng không được chồng thời gian");
        movingUntil.set(op.action.target, op.to);
      }
      for (const progress of [0, ...cue.operations.map((op) => op.from), 1]) {
        const visible = stateAt(scene, i, progress).filter((object) => object.visible);
        if (new Set(visible.map((object) => object.slot)).size !== visible.length) fail(cue.id, "Đối tượng chồng vị trí sau thao tác");
        for (const object of visible) {
          if (object.queue.length > (scene.layout === "queue" ? 12 : 4)) fail(cue.id, "Hàng đợi vượt vùng hiển thị: preset queue tối đa 12, preset khác tối đa 4 phần tử");
          if (object.queue.some((label) => label.length > 8)) fail(cue.id, "Nhãn phần tử queue tối đa 8 ký tự cho preset");
          if ([object.queue.length > 0, !!object.counter, !!object.callout].filter(Boolean).length > 1) fail(cue.id, "Preset chỉ đủ chỗ cho một trong queue, counter hoặc callout");
          if (object.callout && object.callout.length > 70) fail(cue.id, "Callout quá dài; tối đa 70 ký tự cho preset");
        }
      }
    }
  }
  return issues;
}
