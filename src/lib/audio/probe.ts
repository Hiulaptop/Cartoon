import { Input, BufferSource, MP3, WAVE } from "mediabunny";
import type { AudioSourceMeta } from "./types";
import { validatePcmWaveContainer } from "./wave";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const AUDIO_MIMES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"];
export async function probeAudio(bytes: Uint8Array, declaredMime: string): Promise<Omit<AudioSourceMeta, "filePath" | "sha256">> {
  if (!bytes.byteLength || bytes.byteLength > MAX_AUDIO_BYTES || !AUDIO_MIMES.includes(declaredMime)) throw new Error("Chỉ nhận MP3/WAV PCM, tối đa 25 MiB");
  if (["audio/wav", "audio/x-wav"].includes(declaredMime)) validatePcmWaveContainer(bytes);
  const input = new Input({ formats: [MP3, WAVE], source: new BufferSource(bytes) });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const format = await input.getFormat();
        const tracks = await input.getAudioTracks();
        if (tracks.length !== 1 || (await input.getVideoTracks()).length) throw new Error("Cần đúng một audio track và không có video");
        const codec = await tracks[0].getCodec();
        const isMp3 = format === MP3;
        if (isMp3 ? codec !== "mp3" : !codec || !/^pcm-(u8|s16|s24|s32)$/.test(codec)) throw new Error("Codec không hỗ trợ: chỉ MP3 hoặc WAV integer PCM");
        if (isMp3 !== ["audio/mpeg", "audio/mp3"].includes(declaredMime)) throw new Error("MIME không khớp nội dung file");
        const durationSeconds = await input.computeDuration();
        const sampleRate = await tracks[0].getSampleRate();
        const channels = await tracks[0].getNumberOfChannels();
        if (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600 || sampleRate <= 0 || channels <= 0) throw new Error("Audio phải có thời lượng trên 0 và tối đa 10 phút");
        return { bytes: bytes.byteLength, durationSeconds, sampleRate, channels, codec: codec! };
      })(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { input.dispose(); reject(new Error("Đọc metadata audio quá 30 giây")); }, 30_000); }),
    ]);
  } catch (error) {
    if (error instanceof Error && /^(Chỉ nhận|Cần đúng|Codec không|MIME không|Audio phải|Đọc metadata)/.test(error.message)) throw error;
    throw new Error("Không đọc được audio; kiểm tra file MP3/WAV PCM");
  } finally {
    clearTimeout(timer);
    input.dispose();
  }
}
