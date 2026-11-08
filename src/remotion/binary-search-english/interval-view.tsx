import React from "react";
import type { SearchStep } from "../../lib/local-video/binary-search/contracts";
import { linearProgress } from "../../lib/local-video/binary-search/trace";

const number = (n: number) => n.toLocaleString("en-US");
export function IntervalView({ step, phase }: { step: SearchStep; phase: "initial" | "before" | "after" }) {
  const lo = phase !== "after" ? step.lo : step.nextLo;
  const hi = phase !== "after" ? step.hi : step.nextHi;
  const count = Math.max(0, hi - lo + 1);
  const width = count / 1000000 * 1620;
  const found = phase === "after" && step.relation === "equal";
  const local = Array.from({ length: Math.min(7, count) }, (_, i) => lo + i + 1);
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 45 }}>
      {[['Positions checked', String(phase === "initial" ? step.ordinal - 1 : step.ordinal)], ['Candidates remaining', number(count)], ['Target value', '1,000,000']].map(([label, value]) => <div key={label}><div style={{ fontSize: 25, color: "#c3c2b7" }}>{label}</div><div style={{ fontSize: 65, marginTop: 8 }}>{value}</div></div>)}
    </div>
    <div style={{ fontSize: 24, marginBottom: 14 }}>Entire list: one million positions</div>
    <div style={{ width: 1620, height: 52, background: "#343432", borderRadius: 5, position: "relative", overflow: "hidden" }}><div style={{ position: "absolute", left: Math.min(1620 - Math.max(8, width), lo / 1000000 * 1620), width: Math.max(8, width), height: 52, background: "#3987e5", border: "2px solid #f0efec" }} /></div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, color: "#c3c2b7", marginTop: 10 }}><span>value 1</span><span>{width < 8 ? "Minimum-size marker — width is not to scale" : "Proportional active interval"}</span><span>value 1,000,000</span></div>
    <div style={{ marginTop: 40, padding: 28, background: "#252524", borderRadius: 12 }}>
      <div style={{ fontSize: 29 }}>Active value bounds: <b>{number(lo + 1)}</b> to <b>{number(hi + 1)}</b></div>
      <div style={{ display: "flex", gap: 12, marginTop: 22 }}>{local.map((value) => <div key={value} style={{ border: "2px solid #3987e5", borderRadius: 8, padding: "15px 17px", fontSize: 26 }}>{number(value)}</div>)}{count > 7 && <div style={{ padding: 15, fontSize: 26 }}>… {number(hi + 1)}</div>}</div>
      <div style={{ marginTop: 16, fontSize: 21, color: "#c3c2b7" }}>Magnified neighborhood — not the scale of the overview bar</div>
    </div>
    <div style={{ marginTop: 25, fontSize: 30 }}>{phase === "initial" ? "No positions inspected yet — all candidates remain" : found ? "✓ Found on check 20  •  Linear search: 1,000,000 positions checked" : `Midpoint value ${number(step.value)} ${step.relation === "less" ? "<" : "="} target ${phase === "after" ? "→ keep the right interval" : ""}`}</div>
  </div>;
}

export function LinearView({ progress, small }: { progress: number; small: boolean }) {
  const length = small ? 12 : 1000000;
  const { checked, found } = linearProgress(length, progress);
  return <div>
    <div style={{ fontSize: 28, color: "#c3c2b7" }}>LINEAR SEARCH · target at the final position</div>
    <div style={{ fontSize: 100, margin: "30px 0" }}>{number(checked)} <span style={{ fontSize: 35 }}>of {number(length)} positions checked</span></div>
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${small ? 12 : 25}, 1fr)`, gap: 8 }}>{Array.from({ length: small ? 12 : 100 }, (_, i) => {
      const visited = (i + 1) / (small ? 12 : 100) <= checked / length;
      return <div key={i} style={{ height: small ? 95 : 40, background: visited ? "#d95926" : "#343432", border: "2px solid #1a1a19", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 25 }}>{small ? i + 1 : ""}</div>;
    })}</div>
    <div style={{ marginTop: 25, fontSize: 27 }}>{small ? "Each drawn cell is one position." : "Aggregate view: each block represents 10,000 positions."} {found ? "✓ Target found." : "→ Continue checking from left to right."}</div>
    <div style={{ marginTop: 30, fontSize: 27, color: "#c3c2b7" }}>Accelerated simulation — not a runtime benchmark</div>
  </div>;
}
