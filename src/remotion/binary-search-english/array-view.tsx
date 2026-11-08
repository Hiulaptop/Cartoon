import React from "react";
import type { SearchStep } from "../../lib/local-video/binary-search/contracts";
import { SMALL_VALUES } from "../../lib/local-video/binary-search/trace";

export function ArrayView({ step, phase, target }: { step: SearchStep; phase: "initial" | "before" | "after"; target: number }) {
  const lo = phase !== "after" ? step.lo : step.nextLo;
  const hi = phase !== "after" ? step.hi : step.nextHi;
  const found = phase === "after" && step.relation === "equal";
  return <div>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 32, marginBottom: 62 }}><span>Target value: <b>{target}</b></span><span>Positions checked: <b>{phase === "initial" ? step.ordinal - 1 : step.ordinal}</b></span><span>Candidates: <b>{Math.max(0, hi - lo + 1)}</b></span></div>
    <div style={{ display: "flex", gap: 10 }}>{SMALL_VALUES.map((value, i) => {
      const active = i >= lo && i <= hi;
      return <div key={i} style={{ position: "relative", flex: 1, textAlign: "center" }}>
        <div style={{ height: 42, fontSize: 23 }}>{phase !== "initial" && i === step.mid ? "▼ mid" : ""}</div>
        <div style={{ padding: "27px 0", border: `3px ${active ? "solid" : "dashed"} ${active ? "#3987e5" : "#676761"}`, background: active ? "#243c58" : "#252524", borderRadius: 12, fontSize: 37, opacity: active ? 1 : 0.55 }}>{value}</div>
        <div style={{ fontSize: 20, marginTop: 10, color: "#c3c2b7" }}>index {i}</div>
        <div style={{ height: 40, marginTop: 12, fontSize: 22 }}>{i === lo ? "lo" : ""}{i === lo && i === hi ? " / " : ""}{i === hi ? "hi" : ""}</div>
      </div>;
    })}</div>
    <div style={{ display: "flex", gap: 50, marginTop: 34, fontSize: 25, color: "#c3c2b7" }}><span>■ Solid: still possible</span><span>▧ Dashed: ruled out</span><span>▼ Midpoint inspected</span></div>
    <div style={{ marginTop: 35, fontSize: 36 }}>{phase === "initial" ? "No positions inspected yet — the full interval is still possible" : found ? "✓ Found: 91" : lo > hi ? "∅ Not found — the interval is empty" : `${step.value} ${step.relation === "less" ? "<" : step.relation === "greater" ? ">" : "="} ${target} ${phase === "after" ? "→ update the interval" : "→ compare values"}`}</div>
  </div>;
}
