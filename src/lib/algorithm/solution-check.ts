import type { AlgorithmSolutionV1, AlgorithmSolutionV2 } from "./contracts";
import { findCodeIssues } from "./code-check";

// Luật cho lời giải do LLM sinh (user yêu cầu 2026-10-25): không có code, và phải DẪN DẮT Ý TƯỞNG đầy đủ chứ không chỉ liệt kê kết quả.
// Ngưỡng độ dài là mức tối thiểu để buộc LLM trình bày hành trình tư duy; chỉnh ở đây nếu thấy quá chặt hoặc quá lỏng.
export const SOLUTION_MIN_CHARS = { insight: 300, algorithm: 400, walkthrough: 300 } as const;

export function checkSolutionIdeas(solution: AlgorithmSolutionV1): string[] {
  const problems: string[] = [];
  if (solution.representation !== "explanation") problems.push('representation: phải là "explanation" (lời giải trình bày bằng ý tưởng, không code)');
  if (solution.code.trim()) problems.push("code: phải là chuỗi rỗng; lời giải không chứa code, hãy chuyển phần đó thành mô tả ý tưởng bằng lời");
  if (solution.insight.length < SOLUTION_MIN_CHARS.insight) problems.push(`insight: quá ngắn (${solution.insight.length} ký tự, cần ít nhất ${SOLUTION_MIN_CHARS.insight}); hãy kể hành trình tư duy: quan sát từ ví dụ nhỏ, cách ngây thơ và vì sao nó chưa đủ, bước ngoặt dẫn tới ý tưởng`);
  if (solution.algorithm.length < SOLUTION_MIN_CHARS.algorithm) problems.push(`algorithm: quá ngắn (${solution.algorithm.length} ký tự, cần ít nhất ${SOLUTION_MIN_CHARS.algorithm}); hãy nêu từng bước bằng lời kèm lý do của mỗi bước`);
  if (solution.walkthrough.length < SOLUTION_MIN_CHARS.walkthrough) problems.push(`walkthrough: quá ngắn (${solution.walkthrough.length} ký tự, cần ít nhất ${SOLUTION_MIN_CHARS.walkthrough}); hãy truy vết một ví dụ cụ thể từng bước với giá trị thật`);
  return problems;
}

// LLM đôi khi viết xuống dòng thành gạch chéo ngược + n (JSON thoát kép) nên chuỗi chứa ký tự `\n` literal thay vì xuống dòng.
// Lời giải không chứa code nên chuẩn hóa an toàn các trường văn bản.
export function normalizeSolutionText(solution: AlgorithmSolutionV1): AlgorithmSolutionV1 {
  const fix = (value: string) => value.replace(/\\n/g, "\n");
  return { ...solution, insight: fix(solution.insight), algorithm: fix(solution.algorithm), correctness: fix(solution.correctness), walkthrough: fix(solution.walkthrough), complexity: { ...solution.complexity, explanation: fix(solution.complexity.explanation) } };
}

export const LANGUAGE_NOTE_MIN_CHARS = 80;

// V2: không code thật ở mọi trường; mã giả và lưu ý ngôn ngữ phải có nội dung.
export function checkSolutionV2(solution: AlgorithmSolutionV2): string[] {
  const problems: string[] = [];
  if (solution.insight.length < SOLUTION_MIN_CHARS.insight) problems.push(`insight: quá ngắn (${solution.insight.length} ký tự, cần ít nhất ${SOLUTION_MIN_CHARS.insight}); hãy kể hành trình tư duy: quan sát từ ví dụ nhỏ, cách ngây thơ và vì sao nó chưa đủ, bước ngoặt dẫn tới ý tưởng`);
  if (solution.algorithm.length < SOLUTION_MIN_CHARS.algorithm) problems.push(`algorithm: quá ngắn (${solution.algorithm.length} ký tự, cần ít nhất ${SOLUTION_MIN_CHARS.algorithm}); hãy nêu từng bước bằng lời kèm lý do của mỗi bước`);
  if (solution.walkthrough.length < SOLUTION_MIN_CHARS.walkthrough) problems.push(`walkthrough: quá ngắn (${solution.walkthrough.length} ký tự, cần ít nhất ${SOLUTION_MIN_CHARS.walkthrough}); hãy truy vết một ví dụ cụ thể từng bước với giá trị thật`);
  if (solution.pseudocode.trim().split("\n").length < 3) problems.push("pseudocode: cần ít nhất 3 dòng mã giả có thụt lề (với mỗi, nếu, lặp...)");
  for (const lang of ["cpp", "python"] as const) {
    if (solution.languageNotes[lang].length < LANGUAGE_NOTE_MIN_CHARS) problems.push(`languageNotes.${lang}: quá ngắn (cần ít nhất ${LANGUAGE_NOTE_MIN_CHARS} ký tự); nêu lưu ý khi cài đặt bằng ngôn ngữ này, chỉ bằng lời`);
  }
  const fields: [string, string][] = [
    ["insight", solution.insight], ["algorithm", solution.algorithm], ["correctness", solution.correctness], ["walkthrough", solution.walkthrough],
    ["complexity.explanation", solution.complexity.explanation], ["pseudocode", solution.pseudocode],
    ["languageNotes.cpp", solution.languageNotes.cpp], ["languageNotes.python", solution.languageNotes.python],
  ];
  for (const [name, value] of fields) problems.push(...findCodeIssues(name, value));
  return problems;
}

export function normalizeSolutionV2(solution: AlgorithmSolutionV2): AlgorithmSolutionV2 {
  const fix = (value: string) => value.replace(/\\n/g, "\n");
  return {
    ...solution, insight: fix(solution.insight), algorithm: fix(solution.algorithm), correctness: fix(solution.correctness), walkthrough: fix(solution.walkthrough),
    pseudocode: fix(solution.pseudocode), languageNotes: { cpp: fix(solution.languageNotes.cpp), python: fix(solution.languageNotes.python) },
    complexity: { ...solution.complexity, explanation: fix(solution.complexity.explanation) },
  };
}
