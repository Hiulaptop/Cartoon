export function wavDurationMs(buffer: Buffer): number {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("Phản hồi TTS không phải file WAV");
  let offset = 12;
  let byteRate = 0;
  let dataBytes = -1;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") byteRate = buffer.readUInt32LE(offset + 16);
    if (id === "data") { dataBytes = Math.min(size, buffer.length - offset - 8); break; }
    offset += 8 + size + (size % 2);
  }
  if (!byteRate || dataBytes < 0) throw new Error("WAV thiếu chunk fmt hoặc data");
  return Math.round((dataBytes / byteRate) * 1000);
}
