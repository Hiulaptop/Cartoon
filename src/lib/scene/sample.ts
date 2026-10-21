import { characterId, defaultState } from "./refs";
import type { Catalog } from "./catalog";
import { FPS, SCENE_DSL_VERSION, type SceneDsl } from "./schema";

// Cảnh mẫu 6 giây từ asset đã duyệt: 1 nền + tối đa 2 nhân vật. null nếu thiếu nền hoặc nhân vật.
export function sampleSceneDsl(catalog: Catalog): SceneDsl | null {
  const all = [...catalog.values()];
  const bg = all.find((a) => a.kind === "bg");
  const chars = all.filter((a) => a.kind === "chr").slice(0, 2);
  if (!bg || chars.length === 0) return null;

  const pickState = (variants: Map<string, unknown>) => (variants.has(defaultState("chr")) ? "idle" : "base");
  const bgState = bg.variants.has("base") ? undefined : [...bg.variants.keys()][0];
  const duration = 6 * FPS;

  return {
    version: SCENE_DSL_VERSION,
    durationFrames: duration,
    background: { ref: bgState ? `@${bg.name}.${bgState}` : `@${bg.name}` },
    characters: chars.map((c, i) => ({
      id: characterId(c.name),
      ref: `@${c.name}`,
      x: chars.length === 1 ? 0.5 : i === 0 ? 0.3 : 0.7,
      y: 0.92,
      height: 0.6,
      flip: i === 1,
      states: [{ at: 0, state: pickState(c.variants) }, ...(c.variants.has("happy") ? [{ at: 3 * FPS, state: "happy" }] : [])],
      moves: [],
    })),
    props: [],
    effects: [],
    dialogue: [
      { speaker: characterId(chars[0].name), text: "Hello! This is a test scene.", from: FPS, to: 3 * FPS },
    ],
    camera: [
      { at: 0, zoom: 1, fx: 0.5, fy: 0.5 },
      { at: duration - 1, zoom: 1.15, fx: 0.5, fy: 0.6 },
    ],
    transition: { in: "fade", out: "fade", frames: 12 },
  };
}
