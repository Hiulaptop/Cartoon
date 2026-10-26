import type { AlgorithmProblemV2 } from "./contracts";
import { findCodeIssues } from "./code-check";

export const STORY_WORDS = { min: 80, max: 450 } as const;
export const PROBLEM_MIN_CHARS = { modeling: 100, text: 80 } as const;

// Dấu hiệu modeling đã trình bày lời giải (thao tác thuật toán hoặc độ phức tạp). Modeling chỉ được nói bài toán là gì.
const SOLUTION_LEAKS: { re: RegExp; label: string }[] = [
  { re: /\bO\s*\(/, label: "độ phức tạp O(...)" },
  { re: /(tăng|giảm|dịch|di chuyển|tiến|lùi)\s+(con\s+)?trỏ/i, label: "thao tác di chuyển con trỏ" },
  { re: /(chia đôi|thu hẹp (phạm vi|khoảng)|loại (bỏ )?(một )?nửa)/i, label: "thao tác chia đôi/thu hẹp phạm vi" },
  { re: /(lower_bound|upper_bound|tìm kiếm nhị phân|hai con trỏ|quy hoạch động|tham lam)\s*(sẽ|giúp|cho phép)/i, label: "tên thuật toán kèm cách dùng" },
];

export function findSolutionLeaks(modeling: string): string[] {
  return SOLUTION_LEAKS.filter(({ re }) => re.test(modeling)).map(({ label }) => `modeling: chứa ${label}; modeling chỉ ánh xạ truyện sang bài toán, không trình bày lời giải hay độ phức tạp`);
}

export function checkProblemV2(problem: AlgorithmProblemV2): string[] {
  const problems: string[] = [];
  const words = problem.story.trim().split(/\s+/).filter(Boolean).length;
  if (words < STORY_WORDS.min) problems.push(`story: quá ngắn (${words} từ, cần ít nhất ${STORY_WORDS.min}); kể một tình huống có nhân vật, mục tiêu và khó khăn cụ thể`);
  if (words > STORY_WORDS.max) problems.push(`story: quá dài (${words} từ, tối đa ${STORY_WORDS.max}); truyện phải ngắn gọn`);
  if (problem.modeling.length < PROBLEM_MIN_CHARS.modeling) problems.push(`modeling: quá ngắn (${problem.modeling.length} ký tự, cần ít nhất ${PROBLEM_MIN_CHARS.modeling}); nêu nhân vật/vật thể trong truyện tương ứng đại lượng nào của bài toán`);
  if (problem.text.length < PROBLEM_MIN_CHARS.text) problems.push(`text: quá ngắn (${problem.text.length} ký tự, cần ít nhất ${PROBLEM_MIN_CHARS.text}); đề phải có mô tả, đầu vào, đầu ra, ràng buộc và ví dụ`);
  problems.push(...findSolutionLeaks(problem.modeling));
  problems.push(...findCodeIssues("story", problem.story), ...findCodeIssues("modeling", problem.modeling), ...findCodeIssues("text", problem.text));
  return problems;
}

// LLM đôi khi viết xuống dòng thành chuỗi `\n` literal (JSON thoát kép).
export function normalizeProblemV2(problem: AlgorithmProblemV2): AlgorithmProblemV2 {
  const fix = (value: string) => value.replace(/\\n/g, "\n");
  return { ...problem, story: fix(problem.story), modeling: fix(problem.modeling), text: fix(problem.text) };
}
