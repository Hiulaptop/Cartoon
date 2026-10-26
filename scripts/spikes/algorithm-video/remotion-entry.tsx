import React from "react";
import { AbsoluteFill, Composition, Sequence, registerRoot, useCurrentFrame } from "remotion";

const Probe: React.FC = () => {
  const frame = useCurrentFrame();
  const values = [3, 1, 4, 2];
  const active = Math.floor(frame / 15) % values.length;
  return (
    <AbsoluteFill style={{ backgroundColor: "#101827", color: "#f8fafc", padding: 72, fontFamily: "sans-serif" }}>
      <div style={{ fontSize: 68, fontWeight: 700 }}>Giải thuật · Mảng</div>
      <div style={{ display: "flex", gap: 16, marginTop: 120 }}>
        {values.map((value, i) => (
          <div key={i} style={{ width: 140, height: 140, display: "grid", placeItems: "center", borderRadius: 20, background: i === active ? "#38bdf8" : "#334155", fontSize: 64 }}>{value}</div>
        ))}
      </div>
      <svg viewBox="0 0 720 360" style={{ width: 720, height: 360, marginTop: 100 }}>
        <line x1="160" y1="80" x2="520" y2="80" stroke="#94a3b8" strokeWidth="5" />
        {[160, 520].map((x, i) => <g key={x}><circle cx={x} cy="80" r="48" fill={i ? "#f59e0b" : "#a78bfa"} /><text x={x} y="210" fill="white" textAnchor="middle" fontSize="30">{i ? "đích" : "đầu"}</text></g>)}
      </svg>
      <Sequence from={0} durationInFrames={90}>
        <div style={{ position: "absolute", bottom: 60, width: "100%", left: 0, textAlign: "center", fontSize: 42 }}>Tìm phần tử thứ {active + 1} · tiếng Việt: ấ ơ ư</div>
      </Sequence>
    </AbsoluteFill>
  );
};

const Root: React.FC = () => <Composition id="AlgorithmProbe" component={Probe} durationInFrames={90} fps={30} width={1080} height={1920} />;
registerRoot(Root);
