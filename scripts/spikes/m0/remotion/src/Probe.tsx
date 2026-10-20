import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

const LINES = [
  "Did you finish the homework?",
  "Homework? I thought that was optional.",
  "It was due yesterday.",
  "Then it's history homework now.",
];

export const Probe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const beat = fps * 3;
  const x = width / 2 + Math.sin(frame / (fps * 2)) * 500;
  const bob = Math.abs(Math.sin(frame / 6)) * 20;
  const pop = spring({ fps, frame: frame % beat, config: { damping: 12 } });
  const fade = interpolate(frame % beat, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  const line = LINES[Math.floor(frame / beat) % LINES.length];

  return (
    <AbsoluteFill style={{ backgroundColor: "#bfe3ff" }}>
      <AbsoluteFill style={{ top: 760, backgroundColor: "#7cc56b" }} />
      <Img
        src={staticFile("chr.png")}
        style={{
          position: "absolute",
          left: x - 250,
          top: 260 - bob,
          width: 500,
          transform: `scale(${0.92 + 0.08 * pop})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 60,
          width: "100%",
          textAlign: "center",
          fontSize: 56,
          fontFamily: "sans-serif",
          color: "white",
          textShadow: "0 0 8px black",
          opacity: fade,
        }}
      >
        {line}
      </div>
    </AbsoluteFill>
  );
};
