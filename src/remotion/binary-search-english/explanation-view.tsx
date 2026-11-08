import React from "react";

export function ExplanationView({ kind, cueId }: { kind: string; cueId: string }) {
  if (kind === "hook") return <div style={{ textAlign: "center", paddingTop: 25 }}>
    <div style={{ fontSize: 110, letterSpacing: -5 }}>1,000,000 possibilities.</div>
    <div style={{ fontSize: 110, letterSpacing: -5, marginTop: 10 }}>At most 20 checks.</div>
    <div style={{ display: "flex", justifyContent: "center", gap: 80, marginTop: 55, fontSize: 29 }}><span>▧ Check one position at a time</span><span>■ Eliminate impossible regions</span></div>
    <div style={{ fontSize: 33, marginTop: 55, color: "#c3c2b7" }}>{cueId === "c03" ? "Unsystematic guessing ≠ linear search" : "Sorted input • a better question at every step"}</div>
  </div>;
  if (kind === "halving") {
    const showLog = Number(cueId.slice(1)) >= 29;
    return <div style={{ display: "flex", gap: 80 }}>
      <div style={{ width: 760 }}><div style={{ fontSize: 33, marginBottom: 25 }}>Repeated halving — intuition</div>{[[0, '1,000,000'], [1, '500,000'], [2, '250,000'], [10, '≈ 977'], [20, '≈ 1']].map(([n, count]) => <div key={n} style={{ display: "flex", justifyContent: "space-between", fontSize: 34, padding: "15px 20px", borderBottom: "1px solid #53534f" }}><span>{n} halvings</span><b>{count}</b></div>)}<div style={{ fontSize: 22, color: "#c3c2b7", marginTop: 18 }}>Approximate model; exact search counts use discrete bounds.</div></div>
      <div style={{ flex: 1, paddingTop: 25 }}><div style={{ fontSize: 44 }}>2¹⁹ = 524,288</div><div style={{ fontSize: 44, marginTop: 25 }}>2²⁰ = 1,048,576</div><div style={{ fontSize: 30, marginTop: 35 }}>One million lies between them.</div>{showLog && <><div style={{ fontSize: 40, marginTop: 45 }}>⌊log₂(n)⌋ + 1</div><div style={{ fontSize: 24, color: "#c3c2b7", marginTop: 15 }}>Worst-case positions inspected, n ≥ 1</div></>}<div style={{ fontSize: 30, marginTop: 35 }}>Early equality can finish sooner.</div></div>
    </div>;
  }
  if (kind === "sorted-rule") return <div>
    <div style={{ fontSize: 48 }}>Without order, the elimination proof breaks.</div>
    <div style={{ display: "flex", gap: 25, marginTop: 55 }}>{[2, 5, 8, 100, 9, 12, 15].map((n, i) => <div key={i} style={{ border: `3px ${i === 4 ? "solid" : "dashed"} ${i === 4 ? "#3987e5" : "#676761"}`, borderRadius: 10, width: 150, padding: "25px 0", textAlign: "center", fontSize: 48 }}>{n}<div style={{ fontSize: 21, marginTop: 15 }}>{i === 3 ? "midpoint" : i === 4 ? "target here!" : ""}</div></div>)}</div>
    <div style={{ fontSize: 35, marginTop: 45 }}>Target 9 &lt; midpoint 100 — a sorted-array rule would discard the right.</div>
    <div style={{ fontSize: 30, marginTop: 25, color: "#c3c2b7" }}>But 9 is on the right! This unsorted array breaks the proof.</div>
    <div style={{ fontSize: 30, marginTop: 25 }}>Neither direction is justified without an ordering guarantee.</div>
  </div>;
  return <div style={{ textAlign: "center", paddingTop: 15 }}>
    <div style={{ fontSize: 62 }}>One ordered interval.</div><div style={{ fontSize: 62, marginTop: 16 }}>One midpoint. One justified elimination.</div>
    <div style={{ display: "flex", justifyContent: "center", gap: 85, fontSize: 32, marginTop: 50 }}><span>■ Binary: at most 20 checks</span><span>▧ Linear: up to 1,000,000 checks</span></div>
    <div style={{ fontSize: 36, marginTop: 55 }}>What does it cost to create and maintain that order?</div>
    <div style={{ fontSize: 25, marginTop: 30, color: "#c3c2b7" }}>Work counts, not measured execution time • Sorting is not free</div>
  </div>;
}
