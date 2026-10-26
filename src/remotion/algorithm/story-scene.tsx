import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";

import type { SceneAssetItem } from "@/lib/algorithm/animation/playback";

import { PALETTE } from "./palette";

// Cảnh truyện mở đầu: đoạn phim hoạt hình toàn màn hình từ asset đã gắn (nền phủ kín, nhân vật/đạo cụ cỡ lớn, hiệu ứng).
// Phần giảng phía sau dùng giao diện học thuật (SceneV2), không vẽ asset. Chuyển động tính tất định từ frame.
// Mã trong bundle Remotion: không import DB, pg, sharp, fs.
const WIDTH = 1080;
const GROUND = 1560; // chân nhân vật, ngay trên vùng phụ đề
const MAX_ACTORS = 4;

const pixelated: React.CSSProperties = { imageRendering: "pixelated", objectFit: "contain" };

export const StoryScene: React.FC<{ title: string; items: SceneAssetItem[]; mode: "static" | "url" }> = ({ title, items, mode }) => {
  const frame = useCurrentFrame();
  const source = (src: string) => (mode === "url" ? src : staticFile(src));
  const background = items.find((item) => item.kind === "bg");
  const actors = items.filter((item) => item.kind === "chr" || item.kind === "prop").slice(0, MAX_ACTORS);
  const effects = items.filter((item) => item.kind === "fx").slice(0, 2);
  const slot = (WIDTH - 80) / Math.max(1, actors.length);
  const zoom = interpolate(frame, [0, 300], [1, 1.08], { extrapolateRight: "clamp" });
  const titleIn = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: PALETTE.paper, overflow: "hidden", fontFamily: "Arial, sans-serif" }}>
      {background
        ? <Img src={source(background.src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated", transform: `scale(${zoom})` }} />
        // Kịch bản không gắn bối cảnh: tự vẽ trời và bãi cỏ phẳng kiểu pixel để cảnh truyện vẫn là phim hoạt hình.
        : <AbsoluteFill style={{ background: "linear-gradient(to bottom, #8ED1FC 0%, #BDE6FF 62%, #6BBF59 62%, #4E9F3D 100%)", transform: `scale(${zoom})` }}>
          {[[140, 260, 200], [620, 200, 260], [860, 360, 160]].map(([left, top, width]) => (
            <div key={left} style={{ position: "absolute", left, top, width, height: width * 0.32, background: "#FFFFFF", boxShadow: `${width * 0.18}px ${-width * 0.12}px 0 #FFFFFF, ${-width * 0.18}px ${-width * 0.06}px 0 #FFFFFF` }} />
          ))}
        </AbsoluteFill>}
      {/* Lớp tối nhẹ phía dưới để nhân vật và phụ đề nổi trên nền */}
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 100%)" }} />
      {title && (
        <div style={{ position: "absolute", top: 120, left: 72, right: 72, textAlign: "center", opacity: titleIn, transform: `translateY(${(1 - titleIn) * -30}px)` }}>
          <span style={{ display: "inline-block", padding: "18px 34px", borderRadius: 22, background: "rgba(31, 41, 55, 0.88)", color: PALETTE.paper, fontSize: 56, fontWeight: 700, lineHeight: 1.2 }}>{title}</span>
        </div>
      )}
      {actors.map((item, index) => {
        // Khung theo tỉ lệ ảnh: cao tối đa theo loại, rộng không vượt ô của mình (ảnh ngang thì rộng hơn, thấp hơn).
        const aspect = Number.isFinite(item.aspect) && item.aspect > 0 ? item.aspect : 1;
        const maxHeight = item.kind === "chr" ? 440 : 340;
        const width = Math.min(slot - 20, maxHeight * aspect);
        const height = width / aspect;
        const enter = interpolate(frame, [6 + index * 6, 22 + index * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const bob = Math.sin((frame + index * 11) / 8) * 8;
        return (
          <Img key={`${item.src}:${index}`} src={source(item.src)} style={{
            ...pixelated, position: "absolute", left: 40 + index * slot + (slot - width) / 2, top: GROUND - height, width, height,
            opacity: enter, transform: `translateY(${bob + (1 - enter) * 120}px)`,
          }} />
        );
      })}
      {effects.map((item, index) => {
        const pulse = 0.75 + 0.25 * Math.sin(frame / 6 + index * 2);
        return (
          <Img key={`${item.src}:fx${index}`} src={source(item.src)} style={{
            ...pixelated, position: "absolute", right: 90 + index * 180, top: 420 + index * 120, width: 160, height: 160, opacity: pulse, transform: `scale(${pulse})`,
          }} />
        );
      })}
    </AbsoluteFill>
  );
};
