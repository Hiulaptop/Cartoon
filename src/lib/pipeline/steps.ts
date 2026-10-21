// 7 bước của quy trình (spec §5). Bước 1 làm ở trang Bộ phim; bước 2–7 làm trong từng bản thiết kế
// (spec series-project-design §5).
export type PipelineStep = {
  number: number;
  title: string;
  description: string;
  // Nơi làm bước này trên giao diện.
  where: string;
  hidden?: boolean;
};

export const PIPELINE_STEPS: readonly PipelineStep[] = [
  { number: 1, title: "Assets", description: "Sinh và duyệt nhân vật, bối cảnh, đạo cụ", where: "Bộ phim" },
  { number: 2, title: "Kịch bản", description: "Viết kịch bản, thả miếng hài", where: "Bản thiết kế › Kịch bản" },
  { number: 3, title: "Phân cảnh", description: "Viết JSON phân cảnh, giám khảo chấm", where: "Bản thiết kế › Phân cảnh và cảnh" },
  { number: 4, title: "Sinh cảnh", description: "Xem trước cảnh bằng Remotion", where: "Bản thiết kế › Phân cảnh và cảnh" },
  { number: 5, title: "Âm thanh", description: "Tạm ẩn, lồng tiếng làm sau", where: "Sau lát cắt đầu", hidden: true },
  { number: 6, title: "Ghép video", description: "Render toàn tập ra MP4", where: "Bản thiết kế › Ghép video" },
  { number: 7, title: "Upload", description: "Duyệt và upload YouTube", where: "Bản thiết kế › Upload" },
];
