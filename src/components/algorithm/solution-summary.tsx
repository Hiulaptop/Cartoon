type Solution = {
  representation?: string; insight?: string; algorithm?: string; correctness?: string;
  complexity?: { time?: string; memory?: string; explanation?: string };
  code?: string; walkthrough?: string; edgeCases?: string[]; assumptions?: string[];
  pseudocode?: string; languageNotes?: { cpp?: string; python?: string };
};

export function SolutionSummary({ content }: { content: unknown }) {
  const solution = content as Solution;
  return (
    <div className="flex flex-col gap-3 whitespace-pre-wrap">
      <p><strong>Dạng:</strong> {solution.representation}</p>
      <p><strong>Ý tưởng:</strong> {solution.insight}</p>
      <p><strong>Thuật toán:</strong> {solution.algorithm}</p>
      <p><strong>Đúng đắn:</strong> {solution.correctness}</p>
      <p><strong>Độ phức tạp:</strong> thời gian {solution.complexity?.time}; bộ nhớ {solution.complexity?.memory}. {solution.complexity?.explanation}</p>
      {solution.code && <pre className="overflow-x-auto rounded bg-background p-3 font-mono">{solution.code}</pre>}
      {solution.pseudocode && <div><strong>Mã giả:</strong><pre className="mt-1 overflow-x-auto rounded bg-background p-3 font-mono">{solution.pseudocode}</pre></div>}
      {solution.languageNotes?.cpp && <p><strong>Lưu ý C++:</strong> {solution.languageNotes.cpp}</p>}
      {solution.languageNotes?.python && <p><strong>Lưu ý Python:</strong> {solution.languageNotes.python}</p>}
      {solution.walkthrough && <p><strong>Truy vết:</strong> {solution.walkthrough}</p>}
      {!!solution.edgeCases?.length && <p><strong>Ca biên:</strong> {solution.edgeCases.join(" · ")}</p>}
      {!!solution.assumptions?.length && <p><strong>Giả định:</strong> {solution.assumptions.join(" · ")}</p>}
    </div>
  );
}
