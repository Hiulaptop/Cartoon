import { AbsoluteFill, useCurrentFrame } from "remotion";
import { actorAt, evaluateCamera } from "@/lib/animation/motion";
import { evaluateGroundScale } from "@/lib/animation/ground";
import { projectCamera, spriteCorners } from "@/lib/animation/geometry";
import { mainState } from "@/lib/animation/validate";
import { SHOWCASE, type ShowcaseProps } from "@/lib/animation/types";
import { SceneLayers } from "./SceneLayers";

const labels = ["Idle · biểu cảm", "Walk / Run · bob từ ảnh", "Hop · Recoil · Squash", "Camera · SVG", "Phối cảnh gần / xa"];
export function AnimationShowcase(props: ShowcaseProps) {
  const frame = useCurrentFrame(), d = props.draft, actor = actorAt(d, frame), height = evaluateGroundScale(actor.foot, d.layout);
  const state = mainState(props, frame), camera = evaluateCamera(frame, d.intensity, "showcase:v1");
  const world = spriteCorners(props.assets[`${d.characterRef}.${state}`], actor.foot, height, d.anchorByState[state] ?? { x: 0.5, y: 1 }, actor.pose);
  // Debug graphics live outside camera, but coordinates are projected by that same camera.
  const project = (p: { x: number; y: number }) => { const q = projectCamera(p, camera); return { x: q.x * SHOWCASE.width, y: q.y * SHOWCASE.height }; };
  const foot = project(actor.foot), corners = world.map(project);
  const horizon = d.layout.mode === "ground_plane" ? d.layout.horizonY : 0.4;
  return <AbsoluteFill style={{ background: "#182334", overflow: "hidden", fontFamily: "Arial, sans-serif" }}>
    <SceneLayers props={props} frame={frame} />
    {d.debug && <svg viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <line x1={0} x2={1920} y1={project({ x: 0, y: horizon }).y} y2={project({ x: 1, y: horizon }).y} stroke="#fbca55" strokeWidth={3} strokeDasharray="14 10" />
      {d.layout.mode === "ground_plane" && d.layout.standingRegions.map((poly, i) => <polygon key={i} points={poly.map(p => { const q = project(p); return `${q.x},${q.y}`; }).join(" ")} fill="#42dbac19" stroke="#42dbac" strokeWidth={3} />)}
      <polygon points={corners.map(p => `${p.x},${p.y}`).join(" ")} stroke="#ff83d3" fill="none" strokeWidth={2} />
      <circle cx={foot.x} cy={foot.y} r={9} fill="#42dbac" />
    </svg>}
    <div style={{ position: "absolute", top: 28, left: 32, background: "#102030dc", color: "white", padding: "15px 22px", borderRadius: 12, fontSize: 30 }}>{actor.shot === 4 && d.layout.mode === "flat" ? "Bố cục phẳng · scale cố định" : labels[actor.shot]} · {d.intensity} · clip im lặng</div>
    {d.debug && <div style={{ position: "absolute", bottom: 28, left: 32, right: 32, background: "#102030df", color: "white", fontSize: 25, padding: 14 }}>
      {frame}/{SHOWCASE.frames - 1} · state {state} · chân ({actor.foot.x.toFixed(3)}, {actor.foot.y.toFixed(3)}) · height {height.toFixed(3)} · {d.layout.mode === "flat" ? "Flat: horizon chỉ tham chiếu" : `Ground: horizon ${horizon.toFixed(2)}`}<br />
      {props.warnings.join(" · ")}
    </div>}
  </AbsoluteFill>;
}
