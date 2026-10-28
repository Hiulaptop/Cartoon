// 9router 0.5.104 Antigravity sizeToAspectRatio accepts these transport aliases.
// They select aspect ratio, not guaranteed output pixels. Preserve requested size elsewhere.
export function imageTransportSize(model: string, requestedSize?: string): string | undefined {
  if (!requestedSize) return undefined;
  const provider = model.split("/")[0];
  if (provider !== "ag" && provider !== "antigravity") return requestedSize;
  if (requestedSize === "1920x1080") return "1792x1024";
  if (requestedSize === "1080x1920") return "1024x1792";
  return requestedSize;
}
