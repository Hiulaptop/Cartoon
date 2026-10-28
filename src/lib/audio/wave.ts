// RIFF/WAVE integer PCM must be complete; metadata parsers may tolerate truncation.
export function validatePcmWaveContainer(bytes: Uint8Array): void {
  const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const invalid = () => { throw new Error("Không đọc được WAV PCM: file bị cắt cụt, chunk sai hoặc sample không đầy đủ"); };
  if (data.length < 12 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WAVE" || data.readUInt32LE(4) + 8 !== data.length) invalid();
  let offset = 12; let alignment = 0; let dataLength: number | null = null;
  while (offset < data.length) {
    if (offset + 8 > data.length) invalid();
    const kind = data.toString("ascii", offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const start = offset + 8; const end = start + size;
    if (end + (size % 2) > data.length) invalid();
    if (kind === "fmt ") {
      if (alignment || size < 16) invalid();
      const format = data.readUInt16LE(start);
      const channels = data.readUInt16LE(start + 2);
      const sampleRate = data.readUInt32LE(start + 4);
      const byteRate = data.readUInt32LE(start + 8);
      alignment = data.readUInt16LE(start + 12);
      const bits = data.readUInt16LE(start + 14);
      if (format === 0xfffe) {
        if (size < 40 || data.readUInt16LE(start + 16) < 22 || data.subarray(start + 24, start + 40).toString("hex") !== "0100000000001000800000aa00389b71" || data.readUInt16LE(start + 18) > bits || data.readUInt16LE(start + 18) < 1) invalid();
      } else if (format !== 1) invalid();
      if (![8, 16, 24, 32].includes(bits) || !channels || !sampleRate || alignment !== channels * bits / 8 || byteRate !== sampleRate * alignment) invalid();
    } else if (kind === "data") {
      if (dataLength !== null || !size) invalid();
      dataLength = size;
    }
    offset = end + size % 2;
  }
  if (!alignment || dataLength === null || dataLength % alignment !== 0) invalid();
}
