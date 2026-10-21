// Thời gian tương đối ("3 phút trước") để không phụ thuộc múi giờ của server (container chạy UTC).
export function timeAgo(date: Date | null, now: Date = new Date()): string {
  if (!date) return "—";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 5) return "vừa xong";
  if (seconds < 60) return `${seconds} giây trước`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}
