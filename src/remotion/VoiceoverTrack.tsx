import { Audio } from "@remotion/media";
import { staticFile, useCurrentFrame } from "remotion";
import type { ResolvedVoiceover } from "@/lib/audio/types";
import { mixedGains } from "@/lib/audio/timing";

export function VoiceoverTrack({ voiceover, assetMode, onAudioError }: { voiceover: ResolvedVoiceover; assetMode: "static" | "url"; onAudioError?: (message: string) => void }) {
  const frame = useCurrentFrame();
  const gains = mixedGains(voiceover.timeline.clips, frame);
  return <>{voiceover.timeline.clips.map((clip) => {
    const source = voiceover.sources[clip.takeId];
    if (!source) throw new Error("Thiếu bản thu của timeline");
    const src = assetMode === "static" ? staticFile(source.filePath) : `/api/files/${source.filePath}`;
    return <Audio key={clip.id} src={src} name={clip.label} from={clip.from} trimBefore={clip.trimBefore} durationInFrames={clip.durationInFrames} playbackRate={1} volume={gains[clip.id]} onError={() => { onAudioError?.("Không phát được audio; kiểm tra file trước khi xuất video"); return "fail"; }} />;
  })}</>;
}
