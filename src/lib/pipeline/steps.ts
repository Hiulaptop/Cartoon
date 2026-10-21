// 7 bước của quy trình (spec §5). Mỗi mốc làm xong bước nào thì bật `href` của bước đó.
export type PipelineStep = {
  number: number;
  title: string;
  description: string;
  // Mốc triển khai bước này (spec §11).
  milestone: string;
  // Có href nghĩa là đã dùng được.
  href?: string;
  hidden?: boolean;
};

export const PIPELINE_STEPS: readonly PipelineStep[] = [
  { number: 1, title: "Assets", description: "Sinh và duyệt nhân vật, bối cảnh, đạo cụ", milestone: "M2" },
  { number: 2, title: "Kịch bản", description: "Viết kịch bản, thả miếng hài", milestone: "M4" },
  { number: 3, title: "Phân cảnh", description: "Viết JSON phân cảnh, giám khảo chấm", milestone: "M5" },
  { number: 4, title: "Sinh cảnh", description: "Xem trước cảnh bằng Remotion", milestone: "M3" },
  { number: 5, title: "Âm thanh", description: "Tạm ẩn, lồng tiếng làm sau", milestone: "Sau lát cắt đầu", hidden: true },
  { number: 6, title: "Ghép video", description: "Render toàn tập ra MP4", milestone: "M6" },
  { number: 7, title: "Upload", description: "Duyệt và upload YouTube", milestone: "M7" },
];
