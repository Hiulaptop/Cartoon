import type { AnimationOp, AnimationSceneV2, MarkState } from "./schema";

// Mô phỏng thuần (không DOM, không Remotion) các bước của một cảnh V2 (spec animation-engine §6).
// Dùng chung bởi bộ kiểm tra (app + worker) và composition (bundle Remotion): không import DB/pg/sharp/fs.

export const MAX_POINTERS = 4;
export const MAX_TRANSITION_FRAMES = 18;
const TRANSITION_SHARE = 0.6;

export type CellSnapshot = { id: number; value: string; mark: MarkState | null };
export type RangeSnapshot = { from: number; to: number; state: MarkState };
export type PointerSnapshot = { index: number; side: "above" | "below" };
export type SceneSnapshot = { cells: CellSnapshot[]; ranges: RangeSnapshot[]; pointers: Record<string, PointerSnapshot>; note: string | null };
export type CueWindow = { cueId: string; from: number; frames: number };
export type StepPlan = { start: number; transition: number; end: number };
export type SimulatedScene = { initial: SceneSnapshot; snapshots: SceneSnapshot[]; plans: (StepPlan | undefined)[]; errors: string[] };

export function initialSnapshot(scene: AnimationSceneV2): SceneSnapshot {
  return { cells: (scene.array?.values ?? []).map((value, id) => ({ id, value, mark: null })), ranges: [], pointers: {}, note: null };
}

function cloneSnapshot(state: SceneSnapshot): SceneSnapshot {
  return {
    cells: state.cells.map((cell) => ({ ...cell })),
    ranges: state.ranges.map((range) => ({ ...range })),
    pointers: Object.fromEntries(Object.entries(state.pointers).map(([name, pointer]) => [name, { ...pointer }])),
    note: state.note,
  };
}

// Áp một op lên trạng thái; trả về thông báo lỗi (tiếng Việt) hoặc null. Op lỗi không làm đổi trạng thái.
export function applyOp(state: SceneSnapshot, op: AnimationOp): string | null {
  const count = state.cells.length;
  const outside = (index: number) => index >= count;
  switch (op.op) {
    case "pointer.show":
      if (count === 0) return "con trỏ cần cảnh có mảng";
      if (outside(op.index)) return `chỉ số ${op.index} ngoài mảng (${count} ô)`;
      if (!(op.name in state.pointers) && Object.keys(state.pointers).length >= MAX_POINTERS) return `quá ${MAX_POINTERS} con trỏ cùng lúc`;
      state.pointers[op.name] = { index: op.index, side: op.side ?? "below" };
      return null;
    case "pointer.move":
      if (!(op.name in state.pointers)) return `con trỏ "${op.name}" chưa được hiện`;
      if (outside(op.index)) return `chỉ số ${op.index} ngoài mảng (${count} ô)`;
      state.pointers[op.name].index = op.index;
      return null;
    case "pointer.hide":
      if (!(op.name in state.pointers)) return `con trỏ "${op.name}" chưa được hiện`;
      delete state.pointers[op.name];
      return null;
    case "cell.mark":
      if (count === 0) return "đánh dấu cần cảnh có mảng";
      if (op.indices.some(outside)) return `chỉ số đánh dấu ngoài mảng (${count} ô)`;
      for (const index of op.indices) state.cells[index].mark = op.state;
      return null;
    case "cell.set":
      if (count === 0) return "cell.set cần cảnh có mảng";
      if (outside(op.index)) return `chỉ số ${op.index} ngoài mảng (${count} ô)`;
      state.cells[op.index].value = op.value;
      return null;
    case "cell.swap": {
      if (count === 0) return "cell.swap cần cảnh có mảng";
      if (outside(op.i) || outside(op.j)) return `chỉ số đổi chỗ ngoài mảng (${count} ô)`;
      const held = state.cells[op.i];
      state.cells[op.i] = state.cells[op.j];
      state.cells[op.j] = held;
      return null;
    }
    case "range.highlight":
      if (count === 0) return "range.highlight cần cảnh có mảng";
      if (outside(op.from) || outside(op.to)) return `đoạn tô ngoài mảng (${count} ô)`;
      if (op.from > op.to) return "đoạn tô có from lớn hơn to";
      state.ranges = state.ranges.filter((range) => !(range.from === op.from && range.to === op.to));
      state.ranges.push({ from: op.from, to: op.to, state: op.state });
      return null;
    case "note":
      state.note = op.text;
      return null;
    case "clear":
      if (op.target === "marks" || op.target === "all") { for (const cell of state.cells) cell.mark = null; state.ranges = []; }
      if (op.target === "pointers" || op.target === "all") state.pointers = {};
      if (op.target === "note" || op.target === "all") state.note = null;
      return null;
  }
}

// Chia cửa sổ của từng cue cho các bước thuộc cue đó theo trọng số; mỗi bước có thời gian chuyển T rồi giữ đến hết lát.
export function planSteps(scene: AnimationSceneV2, windows: CueWindow[]): { plans: (StepPlan | undefined)[]; errors: string[] } {
  const errors: string[] = [];
  const plans: (StepPlan | undefined)[] = new Array(scene.steps.length).fill(undefined);
  const byCue = new Map<string, number[]>();
  scene.steps.forEach((step, index) => byCue.set(step.cueId, [...(byCue.get(step.cueId) ?? []), index]));
  for (const [cueId, indices] of byCue) {
    const window = windows.find((item) => item.cueId === cueId);
    if (!window) { errors.push(`Cảnh ${scene.id}: cue "${cueId}" không thuộc cảnh này`); continue; }
    const total = indices.reduce((sum, index) => sum + (scene.steps[index].weight ?? 1), 0);
    let cursor = window.from;
    for (const index of indices) {
      const slice = (window.frames * (scene.steps[index].weight ?? 1)) / total;
      const start = Math.round(cursor);
      const end = Math.round(cursor + slice);
      plans[index] = { start, end, transition: Math.max(1, Math.min(MAX_TRANSITION_FRAMES, Math.floor((end - start) * TRANSITION_SHARE))) };
      cursor += slice;
    }
  }
  const order = (cueId: string) => windows.findIndex((item) => item.cueId === cueId);
  for (let index = 1; index < scene.steps.length; index += 1) {
    const before = order(scene.steps[index - 1].cueId);
    const current = order(scene.steps[index].cueId);
    if (before >= 0 && current >= 0 && current < before) errors.push(`Cảnh ${scene.id}, bước ${index + 1}: thứ tự cue giảm dần (các bước phải theo thứ tự cue đọc)`);
  }
  return { plans, errors };
}

export function simulateScene(scene: AnimationSceneV2, windows: CueWindow[]): SimulatedScene {
  const planned = planSteps(scene, windows);
  const errors = [...planned.errors];
  const initial = initialSnapshot(scene);
  const state = cloneSnapshot(initial);
  const snapshots: SceneSnapshot[] = [];
  scene.steps.forEach((step, stepIndex) => {
    step.ops.forEach((op, opIndex) => {
      const problem = applyOp(state, op);
      if (problem) errors.push(`Cảnh ${scene.id}, bước ${stepIndex + 1}, op ${opIndex + 1} (${op.op}): ${problem}`);
    });
    snapshots.push(cloneSnapshot(state));
  });
  return { initial, snapshots, plans: planned.plans, errors };
}

export type VisualCell = { id: number; value: string; slot: number; lift: number; mark: MarkState | null; prevMark: MarkState | null; markMix: number; pulse: number };
export type VisualPointer = { name: string; slot: number; side: "above" | "below"; opacity: number };
export type VisualRange = { from: number; to: number; state: MarkState; opacity: number };
export type VisualNote = { text: string; opacity: number };
export type VisualScene = { cells: VisualCell[]; pointers: VisualPointer[]; ranges: VisualRange[]; notes: VisualNote[] };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

// Trạng thái hiển thị tại một frame tuyệt đối (cùng hệ với `CueWindow.from`).
export function stateAt(sim: SimulatedScene, frame: number): VisualScene {
  let active = -1;
  sim.plans.forEach((plan, index) => { if (plan && plan.start <= frame) active = index; });
  const next = active < 0 ? sim.initial : sim.snapshots[active];
  const prev = active < 0 ? sim.initial : active > 0 ? sim.snapshots[active - 1] : sim.initial;
  const plan = active >= 0 ? sim.plans[active] : undefined;
  const raw = plan ? clamp01((frame - plan.start) / plan.transition) : 1;
  const e = easeInOut(raw);

  const cells: VisualCell[] = next.cells.map((cell, slot) => {
    const previous = prev.cells.findIndex((item) => item.id === cell.id);
    const prevSlot = previous >= 0 ? previous : slot;
    const before = previous >= 0 ? prev.cells[previous] : cell;
    const moved = prevSlot !== slot;
    const changed = before.mark !== cell.mark || before.value !== cell.value;
    return {
      id: cell.id,
      value: e < 0.5 ? before.value : cell.value,
      slot: lerp(prevSlot, slot, e),
      lift: moved ? Math.sin(Math.PI * e) * (slot > prevSlot ? -1 : 1) : 0,
      mark: cell.mark,
      prevMark: before.mark,
      markMix: e,
      pulse: changed || moved ? Math.sin(Math.PI * raw) : 0,
    };
  });

  const pointers: VisualPointer[] = [];
  for (const [name, pointer] of Object.entries(next.pointers)) {
    const before = prev.pointers[name];
    pointers.push({ name, slot: before ? lerp(before.index, pointer.index, e) : pointer.index, side: pointer.side, opacity: before ? 1 : e });
  }
  for (const [name, pointer] of Object.entries(prev.pointers)) {
    if (!(name in next.pointers)) pointers.push({ name, slot: pointer.index, side: pointer.side, opacity: 1 - e });
  }

  const rangeKey = (range: RangeSnapshot) => `${range.from}:${range.to}:${range.state}`;
  const previousRanges = new Set(prev.ranges.map(rangeKey));
  const nextRanges = new Set(next.ranges.map(rangeKey));
  const ranges: VisualRange[] = [
    ...next.ranges.map((range) => ({ ...range, opacity: previousRanges.has(rangeKey(range)) ? 1 : e })),
    ...prev.ranges.filter((range) => !nextRanges.has(rangeKey(range))).map((range) => ({ ...range, opacity: 1 - e })),
  ];

  const notes: VisualNote[] = [];
  if (prev.note === next.note) {
    if (next.note) notes.push({ text: next.note, opacity: 1 });
  } else {
    if (prev.note) notes.push({ text: prev.note, opacity: 1 - e });
    if (next.note) notes.push({ text: next.note, opacity: e });
  }
  return { cells, pointers, ranges, notes };
}
