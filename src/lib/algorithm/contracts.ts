import { z } from "zod";

export const PROBLEM_CONTRACT_VERSION = 1;
export const SOLUTION_CONTRACT_VERSION = 1;

export const AlgorithmProblemV1Schema = z.strictObject({
  version: z.literal(PROBLEM_CONTRACT_VERSION),
  text: z.string().max(100_000),
});
export type AlgorithmProblemV1 = z.infer<typeof AlgorithmProblemV1Schema>;

export const AlgorithmSolutionV1Schema = z.strictObject({
  version: z.literal(SOLUTION_CONTRACT_VERSION),
  representation: z.enum(["cpp", "python", "pseudocode", "explanation"]),
  insight: z.string().min(1).max(20_000),
  algorithm: z.string().min(1).max(40_000),
  correctness: z.string().min(1).max(40_000),
  complexity: z.strictObject({
    time: z.string().min(1).max(500),
    memory: z.string().min(1).max(500),
    explanation: z.string().max(5_000),
  }),
  code: z.string().max(50_000),
  walkthrough: z.string().max(20_000),
  edgeCases: z.array(z.string().min(1).max(2_000)).max(100),
  assumptions: z.array(z.string().min(1).max(2_000)).max(100),
  references: z.array(z.string().max(2_000)).max(100),
});
export type AlgorithmSolutionV1 = z.infer<typeof AlgorithmSolutionV1Schema>;

// V2 (2026-10-25): bước 1 do AI viết từ chủ đề; truyện dẫn tới đề, `modeling` nối truyện sang bài toán, `text` là đề hình thức.
export const AlgorithmProblemV2Schema = z.strictObject({
  version: z.literal(2),
  theme: z.string().min(3).max(500),
  topic: z.string().max(200).optional(),
  story: z.string().min(1).max(20_000),
  modeling: z.string().min(1).max(10_000),
  text: z.string().min(1).max(100_000),
});
export type AlgorithmProblemV2 = z.infer<typeof AlgorithmProblemV2Schema>;

// V2: bỏ `code`; thêm mã giả và lưu ý cài đặt theo ngôn ngữ (chỉ bằng lời, không có code thật).
export const AlgorithmSolutionV2Schema = z.strictObject({
  version: z.literal(2),
  representation: z.literal("explanation"),
  insight: z.string().min(1).max(20_000),
  algorithm: z.string().min(1).max(40_000),
  correctness: z.string().min(1).max(40_000),
  complexity: z.strictObject({
    time: z.string().min(1).max(500),
    memory: z.string().min(1).max(500),
    explanation: z.string().max(5_000),
  }),
  pseudocode: z.string().min(1).max(20_000),
  languageNotes: z.strictObject({
    cpp: z.string().min(1).max(5_000),
    python: z.string().min(1).max(5_000),
  }),
  walkthrough: z.string().max(20_000),
  edgeCases: z.array(z.string().min(1).max(2_000)).max(100),
  assumptions: z.array(z.string().min(1).max(2_000)).max(100),
  references: z.array(z.string().max(2_000)).max(100),
});
export type AlgorithmSolutionV2 = z.infer<typeof AlgorithmSolutionV2Schema>;

export const ALGORITHM_COMBO_COMPONENTS = {
  hook: ["curiosity-question", "problem-statement", "common-mistake", "predict-challenge", "surprising-result", "demo-first", "misconception", "application-story"],
  objective: ["understand-concept", "trace-code", "write-code", "find-fix-bug", "compare-solutions", "analyze-optimize"],
  framing: ["problem-statement", "real-world-scenario", "bug-to-fix", "performance-constraint", "misconception-to-test"],
  structure: ["concept-example-apply", "problem-insight-algorithm-code", "bug-reproduce-diagnose-fix", "goal-build-test-extend", "compare-select-implement", "predict-trace-generalize"],
  illustration: ["worked-example", "trace", "diagram-animation", "right-wrong-contrast", "data-variable-state"],
  codePresentation: ["incremental-code", "complete-then-explain", "illustrative-live-coding", "fill-missing", "repair-buggy-code"],
  activity: ["predict-output", "fill-next-step", "find-bug", "vary-input", "similar-exercise"],
  verification: ["sample-cases", "edge-cases", "correctness-argument", "complexity", "output-comparison"],
  ending: ["recap", "recall-question", "variant-to-solve", "next-challenge"],
} as const;

export const AlgorithmComboV1Schema = z.strictObject({
  version: z.literal(1),
  hook: z.enum(ALGORITHM_COMBO_COMPONENTS.hook),
  objective: z.enum(ALGORITHM_COMBO_COMPONENTS.objective),
  framing: z.enum(ALGORITHM_COMBO_COMPONENTS.framing),
  structure: z.enum(ALGORITHM_COMBO_COMPONENTS.structure),
  illustration: z.enum(ALGORITHM_COMBO_COMPONENTS.illustration).optional(),
  codePresentation: z.enum(ALGORITHM_COMBO_COMPONENTS.codePresentation).optional(),
  activity: z.enum(ALGORITHM_COMBO_COMPONENTS.activity).optional(),
  verification: z.enum(ALGORITHM_COMBO_COMPONENTS.verification).optional(),
  ending: z.enum(ALGORITHM_COMBO_COMPONENTS.ending),
  targetSeconds: z.number().int().min(30).max(180),
  rationale: z.string().min(1).max(5_000),
  objectiveStatement: z.string().min(1).max(2_000),
  outline: z.array(z.object({ id: z.string().min(1).max(40), purpose: z.string().min(1).max(1000), seconds: z.number().int().min(1).max(180) })).min(2).max(20),
});
export type AlgorithmComboV1 = z.infer<typeof AlgorithmComboV1Schema>;

export const AlgorithmScriptV1Schema = z.strictObject({
  version: z.literal(1),
  targetSeconds: z.number().int().min(30).max(180),
  scenes: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    purpose: z.string().min(1).max(2_000),
    visual: z.string().min(1).max(5_000),
    dialogue: z.array(z.string().min(1).max(2_000)).max(30),
    subtitles: z.array(z.string().min(1).max(100)).max(30),
    code: z.string().max(10_000),
    seconds: z.number().int().min(1).max(180),
    assetKeys: z.array(z.string().min(1).max(60)).max(20),
  })).min(1).max(30),
});
export type AlgorithmScriptV1 = z.infer<typeof AlgorithmScriptV1Schema>;

export const AlgorithmAnimationV1Schema = z.strictObject({
  version: z.literal(1),
  width: z.literal(1080),
  height: z.literal(1920),
  fps: z.literal(30),
  durationFrames: z.number().int().min(1).max(5400),
  scenes: z.array(z.strictObject({
    id: z.string().min(1).max(60),
    from: z.number().int().min(0).max(5400),
    durationFrames: z.number().int().min(1).max(5400),
    title: z.string().max(300),
    narration: z.array(z.string().max(2000)).max(30),
    subtitles: z.array(z.string().max(100)).max(30),
    code: z.string().max(10_000),
    values: z.array(z.string().max(300)).max(30),
    highlightIndex: z.number().int().min(0).max(29).nullable(),
  })).min(1).max(30),
});
export type AlgorithmAnimationV1 = z.infer<typeof AlgorithmAnimationV1Schema>;
