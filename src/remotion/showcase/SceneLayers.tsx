import { AbsoluteFill, Img } from "remotion";
import { actorAt, evaluateCamera, identity } from "@/lib/animation/motion";
import { evaluateGroundScale } from "@/lib/animation/ground";
import { itemPose, mainState } from "@/lib/animation/validate";
import { SHOWCASE, type ShowcaseProps } from "@/lib/animation/types";
import { AnimatedSprite, imageSrc } from "./AnimatedSprite";

export function SceneLayers({ props, frame }: { props: ShowcaseProps; frame: number }) {
  const d = props.draft, actor = actorAt(d, frame), state = mainState(props, frame), camera = evaluateCamera(frame, d.intensity, "showcase:v1");
  const height = evaluateGroundScale(actor.foot, d.layout), mainAsset = props.assets[`${d.characterRef}.${state}`];
  const foreground = [{ id: "main", y: actor.foot.y, node: <>
    <div style={{ position: "absolute", left: actor.foot.x * SHOWCASE.width - height * 180, top: actor.foot.y * SHOWCASE.height - 9, width: height * 360, height: 18, background: "#0005", borderRadius: "50%" }} />
    <AnimatedSprite asset={mainAsset} mode={props.assetMode} foot={actor.foot} height={height} anchor={d.anchorByState[state] ?? { x: 0.5, y: 1 }} pose={actor.pose} />
  </> }, ...d.foregroundProps.map(item => ({ id: item.id, y: item.y, node: <AnimatedSprite asset={props.assets[item.ref]} mode={props.assetMode} foot={item} height={item.height} anchor={item.anchor} pose={itemPose(item, props, frame)} flip={item.flip} /> }))].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  return <AbsoluteFill style={{ transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`, transformOrigin: `${camera.fx * 100}% ${camera.fy * 100}%` }}>
    <AbsoluteFill data-layer="background"><Img src={imageSrc(props.assets[d.backgroundRef], props.assetMode)} style={{ width: "100%", height: "100%" }} /></AbsoluteFill>
    <AbsoluteFill data-layer="midground">{d.midgroundItems.map(item => <AnimatedSprite key={item.id} asset={props.assets[item.ref]} mode={props.assetMode} foot={item} height={item.height} anchor={item.anchor} pose={identity()} flip={item.flip} />)}</AbsoluteFill>
    <AbsoluteFill data-layer="foreground">{foreground.map(item => <div key={item.id}>{item.node}</div>)}
      {actor.shot === 3 && <svg width={SHOWCASE.width} height={SHOWCASE.height} style={{ position: "absolute", inset: 0 }} viewBox="0 0 1920 1080"><path d="M 350 620 Q 550 420 800 540" fill="none" stroke="#e54d42" strokeWidth={12} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - (frame % 120) / 119} /><text x="800" y="555" fill="#e54d42" fontSize={60}>➜</text></svg>}
    </AbsoluteFill>
  </AbsoluteFill>;
}
