// Phát hiện code thật (C++/Python) trong văn bản lời giải/kịch bản. Mã giả dùng từ khóa tự nhiên ("với mỗi", "nếu", for/while viết thuần) nên không bị chặn;
// chỉ chặn cú pháp đặc trưng của ngôn ngữ lập trình. Mẫu có thể chặn nhầm hiếm gặp: chỉnh ở đây.
const CODE_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /```/, label: "hàng rào markdown ```" },
  { re: /#include\s*[<"]/, label: "#include" },
  { re: /\busing\s+namespace\b/, label: "using namespace" },
  { re: /\bint\s+main\s*\(/, label: "int main(" },
  { re: /^\s*(def|class)\s+\w+[^\n]*:\s*$/m, label: "khai báo def/class kiểu Python" },
  { re: /^\s*(import\s+[\w.]+\s*$|from\s+[\w.]+\s+import\s)/m, label: "import kiểu Python" },
  { re: /^\s*(for|while|if)\s*\([^\n]*\)\s*\{?\s*$/m, label: "vòng lặp/điều kiện kiểu C" },
  { re: /[)\]]\s*;\s*$/m, label: "câu lệnh kết thúc bằng dấu chấm phẩy" },
  { re: /^\s*(cout|cin|printf|scanf|print)\s*[(<>]/m, label: "lệnh nhập/xuất" },
];

export function findCodeIssues(field: string, text: string): string[] {
  const problems: string[] = [];
  for (const { re, label } of CODE_PATTERNS) {
    if (re.test(text)) problems.push(`${field}: chứa ${label}; không viết code, hãy diễn đạt bằng lời (hoặc mã giả ở trường pseudocode)`);
  }
  return problems;
}
