# M5: Bước 3 Phân cảnh (LangGraph + giám khảo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Từ kịch bản đã duyệt, sinh JSON cảnh (khuôn M3) cho từng cảnh bằng vòng LangGraph *viết → kiểm máy → giám khảo → sửa* (tối đa 2 vòng sửa), lưu kết quả vào `scenes` + `validations`, rồi người duyệt từng cảnh bằng Remotion Player (bước 4 hiển thị cảnh thật).

**Architecture:** Job `scenes.generate` (một lần chạy cho cả kịch bản). `planScenes()` tách kịch bản thành kế hoạch cảnh một cách tất định (không LLM). Đồ thị LangGraph (`Annotation.Root` + `PostgresSaver` trong schema `langgraph`) có các node `viết_JSON_cảnh → kiểm_tra_máy → giám_khảo → (điều kiện) sửa/lưu`; mỗi node xử lý song song có giới hạn (3) các cảnh còn cần làm. Giám khảo là model **khác họ** với model viết, chấm theo G-Eval (suy luận từng bước rồi điền điểm 1–5 vào form JSON), hai tiêu chí chặn cứng. Worker chết thì chạy tiếp từ checkpoint bằng cùng `thread_id` (= `jobRunId`). Không đổi schema DB.

**Tech Stack:** M1–M4 + `@langchain/langgraph` **1.5.1**, `@langchain/langgraph-checkpoint-postgres` **1.1.0**, `@langchain/core` **1.2.19** (đúng phiên bản đã chạy ở spike M0).

**Spec:** `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md` (§5 bước 3, §6, §8 dòng LangGraph, §12), `docs/standards/asset-naming.md`

## Global Constraints

- Không có test tự động (AGENTS.md luật 4–6). Xác minh bằng `tsc`, lint, build và chạy thật.
- **Không đổi schema DB.** Bảng checkpoint do `PostgresSaver.setup()` tạo trong schema riêng `langgraph` (bảng hệ thống, như spec §4 đã nêu). Khuôn JSON cảnh là khuôn đã duyệt ở M3; **bộ tiêu chí giám khảo và hai quyết định "ngưỡng đạt 3.5" / "họ model" ở mục Quyết định là hợp đồng cần duyệt cùng plan.**
- Giám khảo phải **khác họ** với model viết (spec §6). Code từ chối chạy nếu cùng họ, **trừ khi** người dùng bật `LLM_JUDGE_ALLOW_SAME_FAMILY=true`. Người dùng đã quyết định (2026-10-21) tạm dùng cùng họ `gemini` cho tới khi thêm provider khác; đây là ngoại lệ tạm so với spec §6, mất tác dụng chống thiên vị tự ưu ái, nên mọi lần chấm cùng họ được gắn cờ `sameFamily: true` trong `validations.scores` để loại khỏi hiệu chỉnh/ACE về sau.
- Tối đa **2 vòng sửa** (3 lần viết cho mỗi cảnh); quá thì cảnh `failed` (spec §5 bước 3).
- **Duyệt plan này = đồng ý chi phí kiểm chứng ở Task 4:** với kịch bản ~90 giây (khoảng 6–10 cảnh): 6–30 lời gọi model viết và 6–30 lời gọi giám khảo (mỗi lời khoảng 3–8 nghìn token).
- Commit theo luật 7, kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Nguồn đã tra (luật 1) — ngày 2026-10-21

| Nội dung | Nguồn | Kết luận |
|---|---|---|
| `Annotation.Root` với `reducer` + `default`; `compile({ checkpointer })`; `config.configurable.thread_id`; `graph.getState(config).next`; resume bằng `graph.invoke(null, config)`; `recursionLimit` mặc định 25, đặt ở **ngoài** `configurable` | context7 `/websites/langchain_oss_javascript_langgraph` (add-memory, fault-tolerance, graph-api) | Dùng đúng như tài liệu |
| `new PostgresSaver(pool, undefined, { schema })` + `await saver.setup()` | Chạy thật ở spike M0 (`scripts/spikes/m0/db-probe.mjs`, setup 514 ms, đọc lại state đúng); tài liệu nêu `PostgresSaver.fromConnString(uri)` là dạng khác | Dùng dạng constructor với pool sẵn có (`getPool()`), schema `langgraph` |
| G-Eval: tiêu chí có định nghĩa, suy luận từng bước rồi chấm điểm vào form | [arXiv 2303.16634](https://arxiv.org/abs/2303.16634v3) (đã nêu trong spec §14) | Dạng form JSON của giám khảo |
| Thiên vị tự ưu ái đầu ra của chính mình | [arXiv 2306.05685](https://arxiv.org/pdf/2306.05685) (đã nêu trong spec §14) | Giám khảo khác họ |
| Tiêu chí quảng cáo YouTube | [Advertiser-friendly content guidelines](https://support.google.com/youtube/answer/6162278?hl=en) (đọc trực tiếp 2026-10-21) | Nhóm "không phù hợp quảng cáo": ngôn ngữ thô tục kéo dài, bạo lực/máu me không bối cảnh, nội dung người lớn, gây sốc, hành vi nguy hiểm, thù ghét, ma túy, súng, chủ đề gây tranh cãi, sự kiện nhạy cảm, hành vi gian dối, nội dung không hợp với trẻ em/gia đình, lăng mạ/bắt nạt, thuốc lá |
| Định nghĩa TV-14 và các nhãn D/L/S/V | Trang chính thức tvguidelines.org **không tải được** (404); chỉ có bản FCC (`transition.fcc.gov/Bureaus/Cable/Public_Notices/1997/fcc97321.html`) và nguồn thứ cấp qua tìm kiếm | **Chưa xác minh từ nguồn chính thức.** Task 1 bước 1 phải tải nguyên văn từ FCC hoặc tvguidelines.org rồi dán vào comment của `rubric.ts`. Trước khi xong bước đó, dùng diễn đạt trong plan này chỉ như bản nháp |

## Quyết định (cần duyệt)

| # | Quyết định | Lý do |
|---|---|---|
| 1 | `chia_cảnh` là hàm **tất định** `planScenes`, không gọi LLM | Rẻ, lặp lại được; kịch bản đã chia nhịp và có `seconds` |
| 2 | Một nhịp → một cảnh nếu `seconds ≤ 25`; dài hơn thì chia đều thoại thành `ceil(seconds / 20)` cảnh con | DSL tối đa 30 giây; combo khuyên cảnh ≤ 25 giây |
| 3 | Họ model = chữ cái đầu tiên sau tiền tố nhà cung cấp (`ag/gemini-3-flash` → `gemini`, `cc/claude-...` → `claude`). Cùng họ thì job `failed` ngay, trừ khi `LLM_JUDGE_ALLOW_SAME_FAMILY=true` (ngoại lệ tạm theo quyết định của người dùng: cho chạy, ghi log cảnh báo, gắn `sameFamily: true` vào mọi bản ghi chấm) | Heuristic đơn giản; sai thì sửa hàm `modelFamily` |
| 4 | Điều kiện đạt: không vi phạm hai tiêu chí chặn cứng **và** điểm trung bình các tiêu chí tính điểm ≥ **3.5** (`JUDGE_PASS_AVG`, hằng trong `rubric.ts`, bump `RUBRIC_VERSION` khi đổi) | Spec §6 |
| 5 | Lớp 1 cho cảnh kiểm thêm: thoại **đúng nguyên văn và đúng thứ tự** thoại trong kế hoạch; tốc độ đọc ≤ 20 ký tự/giây, mỗi câu 5/6–7 giây (M4) | LLM không được viết lại thoại đã duyệt |
| 6 | Mỗi lần kiểm lớp 1 và mỗi lần chấm đều ghi `validations` | Lịch sử cho ACE về sau (spec §7) |
| 7 | Tạo lại cả bộ cảnh bằng "Sinh phân cảnh"; sinh lại một cảnh `failed`/bị loại bằng nút trên cảnh (job `scenes.generate` với `positions`) | Người xử lý được từng cảnh |
| 8 | Loại một cảnh phải ghi lý do; lý do đưa vào lần viết lại cảnh đó | Giống asset (M2) và kịch bản (M4) |

## Bộ tiêu chí giám khảo `rubric-v1` (cần duyệt)

| id | Căn cứ | Loại | Ghi chú cho giám khảo |
|---|---|---|---|
| `age_rating` | TV Parental Guidelines, trần **TV-14** (nhãn D, L, S, V) | **Chặn cứng** | Vi phạm nếu có bạo lực mạnh, tình huống tình dục, ngôn ngữ thô tục mạnh hoặc thoại gợi dục |
| `ad_safe` | YouTube Advertiser-friendly guidelines, mức "đầy đủ quảng cáo" | **Chặn cứng** | Vi phạm nếu rơi vào nhóm "không phù hợp quảng cáo" hoặc "quảng cáo hạn chế" nêu ở bảng nguồn |
| `humor` | Benign violation theory (McGraw & Warren 2010) | Điểm 1–5, **mỗi miếng hài của cảnh một điểm** (bỏ qua nếu cảnh không có gag) | Có vi phạm kỳ vọng nhưng vô hại; setup và payoff đủ rõ |
| `story` | Tiêu chí nội bộ | Điểm 1–5 | Mạch cảnh rõ, setup–payoff, nhịp độ khớp combo |
| `fidelity` | So với kế hoạch cảnh/kịch bản đã duyệt | Điểm 1–5 | Đủ nhân vật, bối cảnh, hành động ghi chú; không thêm tình tiết lạc đề |

Giám khảo nhận: kế hoạch cảnh, JSON cảnh, thoại, và thấy rõ lớp 1 đã qua. Trả về form:

```json
{ "blocks": { "age_rating": { "violated": false, "reason": "" }, "ad_safe": { "violated": false, "reason": "" } },
  "scores": { "humor": [{ "beat": "b3", "reasoning": "…", "score": 4 }],
              "story": { "reasoning": "…", "score": 4 }, "fidelity": { "reasoning": "…", "score": 5 } },
  "feedback": "Cụ thể cần sửa gì (rỗng nếu đạt)" }
```

Hiệu chỉnh (spec §6): trang `/scenes` hiện tỉ lệ đồng thuận = số cảnh mà verdict của giám khảo trùng quyết định duyệt/loại của người / số cảnh đã có cả hai.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/judge/rubric.ts` | `RUBRIC_VERSION`, `JUDGE_PASS_AVG`, `modelFamily()`, `assertDifferentFamily()`, `judgeSchema`, `evaluateJudge()` |
| `src/lib/judge/prompts.ts` | `judgeMessages()` |
| `src/lib/scene/plan.ts` | `planScenes(script)` → `ScenePlan[]` |
| `src/lib/scene/prompts.ts` | `sceneMessages()` (viết/sửa JSON cảnh) |
| `src/lib/scene/subtitle-check.ts` | `checkDialogue(plan, dialogue)` (nguyên văn + tốc độ đọc) |
| `src/worker/scene-graph.ts` | Đồ thị LangGraph: state, các node, định tuyến, `buildSceneGraph()` |
| `src/worker/scene-jobs.ts` | Handler `generateScenes`: nạp dữ liệu, chạy/tiếp tục đồ thị, lưu `scenes` + `validations` |
| `src/lib/queue/jobs.ts`, `src/worker/handlers.ts` (sửa) | Đăng ký `scenes.generate` |
| `src/lib/scene/queries.ts` | Đọc cảnh theo video, validation, tỉ lệ đồng thuận |
| `src/app/scenes/actions.ts` (sửa), `src/app/videos/[id]/page.tsx` (sửa), `src/app/scenes/[videoId]/page.tsx` | Nút "Sinh phân cảnh", duyệt/loại từng cảnh |
| `src/components/scene/scene-review.tsx` | Khối Player + validation + duyệt/loại cho một cảnh |

---

### Task 1: Tiêu chí giám khảo và kế hoạch cảnh

**Files:**
- Create: `src/lib/judge/rubric.ts`, `src/lib/judge/prompts.ts`, `src/lib/scene/plan.ts`, `src/lib/scene/subtitle-check.ts`

**Interfaces:**
- Produces: `RUBRIC_VERSION`, `JUDGE_PASS_AVG`, `modelFamily(id)`, `assertDifferentFamily(writer, judge)`, `judgeSchema`, `type JudgeResult`, `evaluateJudge(result): { verdict: "pass" | "fail"; average: number | null; blocked: string[] }`; `type ScenePlan`, `planScenes(script: ScriptV1): ScenePlan[]`; `checkDialogue(plan: ScenePlan, dialogue: SceneDialogue[]): string[]`.

- [ ] **Step 1: Tải nguyên văn định nghĩa TV-14 (luật 1)**

Tải `https://transition.fcc.gov/Bureaus/Cable/Public_Notices/1997/fcc97321.html` (hoặc trang tvguidelines.org nếu mở được), chép **nguyên văn đoạn định nghĩa TV-14 và bốn nhãn D, L, S, V** vào comment đầu `rubric.ts` kèm URL và ngày tra. Nếu không tải được cả hai, **dừng và báo** thay vì dựa vào trí nhớ.

- [ ] **Step 2: Tạo `src/lib/judge/rubric.ts`**

```ts
import * as z from "zod";

// Nguyên văn TV-14 và D/L/S/V: dán ở Step 1 (nguồn + ngày tra) trước khi commit file này.
export const RUBRIC_VERSION = "rubric-v1";
export const JUDGE_PASS_AVG = 3.5; // spec §6: ngưỡng khởi điểm; đổi thì bump RUBRIC_VERSION

// Họ model: chữ cái đầu sau tiền tố nhà cung cấp. "ag/gemini-3-flash" -> "gemini", "cc/claude-x" -> "claude".
export function modelFamily(id: string): string {
  const name = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return /^[a-z]+/i.exec(name)?.[0].toLowerCase() ?? name.toLowerCase();
}

// Trả true nếu cùng họ và được phép (ngoại lệ tạm); ném lỗi nếu cùng họ mà không được phép.
export function assertDifferentFamily(writer: string, judge: string): boolean {
  if (modelFamily(writer) !== modelFamily(judge)) return false;
  if (process.env.LLM_JUDGE_ALLOW_SAME_FAMILY === "true") return true;
  throw new Error(`Giám khảo (${judge}) cùng họ với model viết (${writer}); đặt LLM_JUDGE_MODEL khác họ (spec §6) hoặc LLM_JUDGE_ALLOW_SAME_FAMILY=true`);
}

const score = z.int().min(1).max(5);
const block = z.object({ violated: z.boolean(), reason: z.string() });

export const judgeSchema = z.object({
  blocks: z.object({ age_rating: block, ad_safe: block }),
  scores: z.object({
    humor: z.array(z.object({ beat: z.string(), reasoning: z.string(), score })),
    story: z.object({ reasoning: z.string(), score }),
    fidelity: z.object({ reasoning: z.string(), score }),
  }),
  feedback: z.string(),
});
export type JudgeResult = z.output<typeof judgeSchema>;

export function evaluateJudge(r: JudgeResult): { verdict: "pass" | "fail"; average: number | null; blocked: string[] } {
  const blocked = (Object.entries(r.blocks) as [string, { violated: boolean }][]).filter(([, b]) => b.violated).map(([id]) => id);
  const values = [...r.scores.humor.map((h) => h.score), r.scores.story.score, r.scores.fidelity.score];
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const pass = blocked.length === 0 && average !== null && average >= JUDGE_PASS_AVG;
  return { verdict: pass ? "pass" : "fail", average, blocked };
}
```

- [ ] **Step 3: Tạo `src/lib/scene/plan.ts`**

```ts
import { estimateLineSeconds } from "@/lib/validation/subtitle";
import type { ScriptV1 } from "@/lib/script/schema";

import { FPS, MAX_SCENE_FRAMES } from "./schema";

export type ScenePlan = {
  position: number; // thứ tự cảnh trong video, bắt đầu từ 1
  beatId: string;
  role: string;
  part: [number, number]; // [chỉ số phần, tổng số phần] khi một nhịp bị chia
  location: string;
  characters: string[];
  lines: { speaker: string; text: string }[];
  actions: string[];
  gag?: ScriptV1["beats"][number]["gag"];
  summary: string;
  seconds: number; // đã đủ để đọc hết thoại
};

const MAX_SINGLE_SECONDS = 25;
const TARGET_PART_SECONDS = 20;
const GAP_SECONDS = 0.4;

export function planScenes(script: ScriptV1): ScenePlan[] {
  const plans: ScenePlan[] = [];
  for (const beat of script.beats) {
    const parts = beat.seconds <= MAX_SINGLE_SECONDS ? 1 : Math.ceil(beat.seconds / TARGET_PART_SECONDS);
    const perPart = Math.ceil(beat.lines.length / parts) || 1;
    for (let p = 0; p < parts; p++) {
      const lines = beat.lines.slice(p * perPart, (p + 1) * perPart);
      const needed = lines.reduce((s, l) => s + estimateLineSeconds(l.text) + GAP_SECONDS, 0);
      const seconds = Math.min(Math.max(Math.round(beat.seconds / parts), Math.ceil(needed), 2), MAX_SCENE_FRAMES / FPS);
      plans.push({
        position: plans.length + 1,
        beatId: beat.id,
        role: beat.role,
        part: [p + 1, parts],
        location: beat.location,
        characters: beat.characters,
        lines,
        actions: beat.actions,
        gag: p === parts - 1 ? beat.gag : undefined, // payoff nằm ở phần cuối của nhịp
        summary: beat.summary,
        seconds,
      });
    }
  }
  return plans;
}
```

- [ ] **Step 4: Tạo `src/lib/scene/subtitle-check.ts`**

```ts
import { SUBTITLE } from "@/lib/validation/subtitle";

import type { ScenePlan } from "./plan";
import { characterId } from "./refs";
import { FPS, type SceneDialogue } from "./schema";

// Lớp 1 cho thoại của cảnh: đúng nguyên văn và thứ tự kế hoạch; mỗi câu đọc kịp (nguồn Netflix, xem M4).
export function checkDialogue(plan: ScenePlan, dialogue: SceneDialogue[]): string[] {
  const issues: string[] = [];
  const ordered = [...dialogue].sort((a, b) => a.from - b.from);

  if (ordered.length !== plan.lines.length) {
    issues.push(`Số câu thoại là ${ordered.length}, kế hoạch có ${plan.lines.length}; không được thêm/bớt thoại`);
  }
  plan.lines.forEach((line, i) => {
    const got = ordered[i];
    if (!got) return;
    if (got.text !== line.text) issues.push(`Câu ${i + 1} phải đúng nguyên văn "${line.text}" (đang là "${got.text}")`);
    if (got.speaker !== characterId(line.speaker)) issues.push(`Câu ${i + 1} phải do ${line.speaker} nói (speaker "${characterId(line.speaker)}")`);
  });
  ordered.forEach((d, i) => {
    const seconds = (d.to - d.from) / FPS;
    const cps = d.text.length / seconds;
    if (seconds < SUBTITLE.minSeconds) issues.push(`Câu ${i + 1} hiện ${seconds.toFixed(2)}s, tối thiểu ${SUBTITLE.minSeconds.toFixed(2)}s`);
    if (seconds > SUBTITLE.maxSeconds) issues.push(`Câu ${i + 1} hiện ${seconds.toFixed(1)}s, tối đa ${SUBTITLE.maxSeconds}s`);
    if (cps > SUBTITLE.maxCharsPerSecond) issues.push(`Câu ${i + 1} đọc ${cps.toFixed(1)} ký tự/giây, tối đa ${SUBTITLE.maxCharsPerSecond}`);
  });
  return issues;
}
```

(`speaker` trong DSL là `id` nhân vật, tính bằng `characterId()` của M3 (`src/lib/scene/refs.ts`), dùng chung cho `sampleSceneDsl`, prompt và kiểm tra này.)

- [ ] **Step 5: Tạo `src/lib/judge/prompts.ts`**

```ts
import * as z from "zod";

import type { ChatMessage } from "@/lib/ninerouter/client";
import type { ScenePlan } from "@/lib/scene/plan";
import type { SceneDsl } from "@/lib/scene/schema";

import { judgeSchema, RUBRIC_VERSION } from "./rubric";

export function judgeMessages(plan: ScenePlan, dsl: SceneDsl): ChatMessage[] {
  const system = [
    `You are a strict, fair reviewer of a scene from a 2D teen cartoon (audience 14-18). Rubric ${RUBRIC_VERSION}.`,
    "Evaluate the scene JSON against the plan. For each criterion first write short reasoning, then give the score (G-Eval style).",
    "HARD BLOCKS (set violated=true if ANY applies):",
    "- age_rating: exceeds TV-14, i.e. intense violence, sexual situations, strong coarse language, or intensely suggestive dialogue.",
    "- ad_safe: not fully advertiser-friendly on YouTube: sustained profanity, violence/blood without context, adult themes, shock content, dangerous acts, hateful or demeaning content, drugs, firearms focus, sensitive events, dishonest behaviour, tobacco, or content inappropriate for kids/families.",
    "SCORES (integers 1-5, 5 best):",
    "- humor: one entry per joke listed in the plan (use its beat id). Benign violation: something wrong yet harmless; setup and payoff must be clear. Skip (empty array) if the plan has no joke.",
    "- story: clear scene arc, setup then payoff, pacing fits the plan.",
    "- fidelity: includes the planned characters, location and actions; adds nothing off-topic.",
    "Reply with ONLY a JSON object matching this JSON Schema (fill `feedback` with concrete fixes, empty string if none):",
    JSON.stringify(z.toJSONSchema(judgeSchema)),
  ].join("\n");

  const user = [
    `PLAN:\n${JSON.stringify(plan, null, 2)}`,
    `SCENE JSON:\n${JSON.stringify(dsl)}`,
    "The JSON already passed deterministic checks (schema, asset references, dialogue wording and reading speed).",
  ].join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
```

- [ ] **Step 6: Kiểm tra tĩnh và commit**

Run: `npx tsc --noEmit`, `npm run lint`.

```bash
git add src/lib/judge src/lib/scene/plan.ts src/lib/scene/subtitle-check.ts
git commit -m "feat(judge): add rubric, scene planning and dialogue check

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Prompt viết cảnh và đồ thị LangGraph

**Files:**
- Create: `src/lib/scene/prompts.ts`, `src/worker/scene-graph.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: Task 1, `checkSceneDsl`, `parseSceneDsl`, `Catalog`, `chat`, `extractJson`.
- Produces: `sceneMessages(input)`; `buildSceneGraph(deps)` trả đồ thị đã compile; `type SceneState`; `type SceneOutcome = { plan: ScenePlan; dsl?: SceneDsl; status: "pass" | "fail"; history: AttemptRecord[] }`.

- [ ] **Step 1: Cài phụ thuộc (ghim chính xác như spike M0)**

Run: `npm install --save-exact @langchain/langgraph@1.5.1 @langchain/langgraph-checkpoint-postgres@1.1.0 @langchain/core@1.2.19`.
Expected: lockfile có ba gói; `npm ls @langchain/core` chỉ một phiên bản (nếu có hai, dùng `overrides` rồi báo).

- [ ] **Step 2: Tạo `src/lib/scene/prompts.ts`**

```ts
import * as z from "zod";

import type { ChatMessage } from "@/lib/ninerouter/client";

import type { Catalog } from "./catalog";
import type { ScenePlan } from "./plan";
import { characterId } from "./refs";
import { FPS, sceneDslSchema } from "./schema";

export type SceneWriteInput = {
  plan: ScenePlan;
  catalog: Catalog;
  isFirst: boolean;
  isLast: boolean;
  feedback?: string; // lỗi lớp 1, nhận xét giám khảo hoặc lý do người loại
  previous?: string; // JSON lần trước để sửa
};

export function sceneMessages(input: SceneWriteInput): ChatMessage[] {
  const { plan, catalog } = input;
  const used = [plan.location, ...plan.characters].map((r) => r.replace(/^@/, "").split(".")[0]);
  const assets = used
    .map((name) => catalog.get(name))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .map((a) => `- @${a.name} (${a.kind}) approved states: ${[...a.variants.keys()].join(", ")}`)
    .join("\n");
  const frames = Math.round(plan.seconds * FPS);

  const system = [
    "You turn one planned scene of a 2D cartoon into a scene JSON for a renderer. Output ONLY the JSON object.",
    `Canvas 1920x1080 at ${FPS} fps. All times are FRAMES (30 frames = 1 second). x,y are fractions of the frame; y is the character's FEET line (use ~0.9); height is a fraction of frame height (0.5-0.7 for a character).`,
    `Set "version" to 1 and "durationFrames" to about ${frames} (at least enough to show every dialogue line).`,
    `Characters: id = asset name without "chr_" truncated to 24 chars (e.g. ${plan.characters[0] ? characterId(plan.characters[0]) : "minh"}); ref = "@chr_name" with NO state; change expression with "states" keyframes (first keyframe at frame 0) using only approved states below.`,
    "Dialogue: copy each line's text EXACTLY and in the same order as the plan, set `speaker` to that character's id, give each line a [from,to) window with no overlap, long enough to read at <= 20 characters per second (at least 25 frames, at most 210 frames).",
    "Use moves/camera sparingly to show the planned actions. A talking character should have talk_a and talk_b approved for the mouth animation; otherwise keep them still.",
    `Transition: ${input.isFirst ? 'in = "fade"' : 'in = "cut"'}, ${input.isLast ? 'out = "fade"' : 'out = "cut"'}, frames = 12.`,
    "Use ONLY these assets and states:",
    assets,
    `JSON Schema:\n${JSON.stringify(z.toJSONSchema(sceneDslSchema, { io: "input" }))}`,
  ].join("\n");

  const user = [
    `PLAN:\n${JSON.stringify({ ...plan, characters: plan.characters.map((c) => ({ ref: c, id: characterId(c) })) }, null, 2)}`,
    input.previous ? `PREVIOUS VERSION (revise it):\n${input.previous}` : "",
    input.feedback ? `FIX THESE PROBLEMS:\n${input.feedback}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
```

- [ ] **Step 3: Tạo `src/worker/scene-graph.ts`**

```ts
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { evaluateJudge, judgeSchema, type JudgeResult } from "@/lib/judge/rubric";
import { judgeMessages } from "@/lib/judge/prompts";
import { extractJson } from "@/lib/llm/json";
import { chat } from "@/lib/ninerouter/client";
import type { Catalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import type { ScenePlan } from "@/lib/scene/plan";
import { sceneMessages } from "@/lib/scene/prompts";
import { parseSceneDsl, type SceneDsl } from "@/lib/scene/schema";
import { checkDialogue } from "@/lib/scene/subtitle-check";

export const MAX_REVISIONS = 2; // spec §5 bước 3
const CONCURRENCY = 3;

export type AttemptRecord = {
  round: number;
  stage: "layer1" | "judge";
  verdict: "pass" | "fail";
  detail: unknown; // layer1: { issues }; judge: { result, average, blocked }
  feedback: string;
  model: string;
};

export type SceneOutcome = {
  plan: ScenePlan;
  dsl?: SceneDsl;
  status: "pending" | "pass" | "fail";
  feedback?: string; // phản hồi cho lần viết kế tiếp
  history: AttemptRecord[];
};

export type GraphDeps = {
  catalog: Catalog;
  writerModel: string;
  judgeModel: string;
  checkpointer: PostgresSaver;
  // Lý do người loại theo position (khi sinh lại một cảnh).
  humanFeedback?: Record<number, string>;
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

const merge = (a: Record<number, SceneOutcome>, b: Record<number, SceneOutcome>) => ({ ...a, ...b });

const State = Annotation.Root({
  scenes: Annotation<Record<number, SceneOutcome>>({ reducer: merge, default: () => ({}) }),
  round: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
});

export function buildSceneGraph(deps: GraphDeps) {
  const pending = (s: typeof State.State) => Object.values(s.scenes).filter((o) => o.status === "pending");

  // Node viết: viết (hoặc sửa) JSON cho mọi cảnh đang `pending`.
  const write = async (s: typeof State.State) => {
    const all = Object.values(s.scenes).sort((a, b) => a.plan.position - b.plan.position);
    const first = all[0]?.plan.position;
    const last = all[all.length - 1]?.plan.position;
    const results = await mapLimit(pending(s), CONCURRENCY, async (o) => {
      const feedback = [deps.humanFeedback?.[o.plan.position], o.feedback].filter(Boolean).join("\n") || undefined;
      const res = await chat({
        model: deps.writerModel,
        temperature: 0.6,
        timeoutMs: 180_000,
        messages: sceneMessages({
          plan: o.plan,
          catalog: deps.catalog,
          isFirst: o.plan.position === first,
          isLast: o.plan.position === last,
          feedback,
          previous: o.dsl ? JSON.stringify(o.dsl) : undefined,
        }),
      });
      let raw: unknown;
      try {
        raw = extractJson(res.content);
      } catch (error) {
        return { ...o, dsl: undefined, feedback: `Phản hồi không phải JSON: ${error instanceof Error ? error.message : error}` };
      }
      const parsed = parseSceneDsl(raw);
      // Sai khuôn: giữ dsl cũ để lần sửa sau có bản trước làm cơ sở, kèm danh sách lỗi.
      return parsed.ok
        ? { ...o, dsl: parsed.dsl, feedback: undefined }
        : { ...o, feedback: parsed.issues.slice(0, 15).join("\n") };
    });
    return { scenes: Object.fromEntries(results.map((r) => [r.plan.position, r])) };
  };

  // Node kiểm máy (lớp 1): schema đã qua ở node viết; đây kiểm tham chiếu asset + thoại + tốc độ đọc.
  const check = async (s: typeof State.State) => {
    const updates: Record<number, SceneOutcome> = {};
    for (const o of pending(s)) {
      // Lần viết vừa rồi sai khuôn (`o.feedback` đã mang lỗi zod): coi là trượt lớp 1.
      const issues = o.feedback
        ? o.feedback.split("\n")
        : o.dsl
          ? [...checkSceneDsl(o.dsl, deps.catalog).issues, ...checkDialogue(o.plan, o.dsl.dialogue)]
          : ["JSON cảnh không đúng khuôn"];
      const pass = issues.length === 0;
      // status vẫn `pending`: chưa kết luận cho tới khi giám khảo chấm hoặc hết lượt sửa (node settle).
      updates[o.plan.position] = {
        ...o,
        feedback: pass ? undefined : issues.slice(0, 15).join("\n"),
        history: [...o.history, { round: s.round, stage: "layer1", verdict: pass ? "pass" : "fail", detail: { issues }, feedback: issues.join("\n"), model: "layer1" }],
      };
    }
    return { scenes: updates };
  };

  // Node giám khảo: chỉ chấm cảnh vừa qua lớp 1.
  const judge = async (s: typeof State.State) => {
    const toJudge = pending(s).filter((o) => o.dsl && o.history[o.history.length - 1]?.stage === "layer1" && o.history[o.history.length - 1].verdict === "pass");
    const results = await mapLimit(toJudge, CONCURRENCY, async (o) => {
      const res = await chat({ model: deps.judgeModel, temperature: 0, timeoutMs: 180_000, messages: judgeMessages(o.plan, o.dsl!) });
      let result: JudgeResult | undefined;
      let feedback = "";
      try {
        const parsed = judgeSchema.safeParse(extractJson(res.content));
        if (parsed.success) result = parsed.data;
        else feedback = `Giám khảo trả form sai khuôn: ${parsed.error.issues.map((i) => i.message).join("; ")}`;
      } catch (error) {
        feedback = `Giám khảo không trả JSON: ${error instanceof Error ? error.message : error}`;
      }
      const evaluated = result ? evaluateJudge(result) : { verdict: "fail" as const, average: null, blocked: [] as string[] };
      if (result) {
        feedback = [
          ...evaluated.blocked.map((id) => `BLOCK ${id}: ${result.blocks[id as keyof typeof result.blocks].reason}`),
          result.feedback,
        ].filter(Boolean).join("\n");
      }
      const record: AttemptRecord = { round: s.round, stage: "judge", verdict: evaluated.verdict, detail: { result, ...evaluated }, feedback, model: deps.judgeModel };
      return { ...o, feedback: evaluated.verdict === "pass" ? undefined : feedback, history: [...o.history, record], status: evaluated.verdict } as SceneOutcome;
    });
    return { scenes: Object.fromEntries(results.map((r) => [r.plan.position, r])) };
  };

  // Node chốt vòng: cảnh còn feedback thì vào vòng sửa, hết lượt thì fail. Cảnh qua lớp 1 mà đã judge pass có status "pass".
  const settle = (s: typeof State.State) => {
    const updates: Record<number, SceneOutcome> = {};
    for (const o of pending(s)) {
      const lastJudge = [...o.history].reverse().find((h) => h.stage === "judge");
      const lastCheck = [...o.history].reverse().find((h) => h.stage === "layer1");
      const passed = lastCheck?.verdict === "pass" && lastJudge?.round === s.round && lastJudge.verdict === "pass";
      if (passed) updates[o.plan.position] = { ...o, status: "pass", feedback: undefined };
      else if (s.round >= MAX_REVISIONS) updates[o.plan.position] = { ...o, status: "fail" };
    }
    return { scenes: updates, round: s.round + 1 };
  };

  const route = (s: typeof State.State) => (pending(s).length === 0 ? END : "write");

  return new StateGraph(State)
    .addNode("write", write)
    .addNode("check", check)
    .addNode("judge", judge)
    .addNode("settle", settle)
    .addEdge(START, "write")
    .addEdge("write", "check")
    .addEdge("check", "judge")
    .addEdge("judge", "settle")
    .addConditionalEdges("settle", route, ["write", END])
    .compile({ checkpointer: deps.checkpointer });
}
```

Hành vi cần giữ: `write` chỉ đụng cảnh `pending`; `check` thêm bản ghi `layer1`; `judge` chỉ chạy với cảnh vừa qua lớp 1 trong vòng này; `settle` kết luận `pass`/`fail` hoặc để `pending` cho vòng sau; `round` tăng sau mỗi vòng; dừng khi không còn cảnh `pending`; vòng cuối là `round === MAX_REVISIONS` (cảnh còn lỗi ở vòng này thành `fail`). Hai điểm cần kiểm khi chạy thật: (1) giá trị `feedback` đặt `undefined` trong object trả về có thực sự xóa giá trị cũ không (reducer `merge` chỉ trộn theo `position`, nên thay cả `SceneOutcome` là ổn); (2) `judge` bỏ qua cảnh mà `write` vừa làm sai khuôn (bản ghi cuối là `layer1`/`fail`).

- [ ] **Step 4: Kiểm tra tĩnh và commit**

Run: `npx tsc --noEmit`, `npm run lint`.

```bash
git add package.json package-lock.json src/lib/scene/prompts.ts src/worker/scene-graph.ts
git commit -m "feat(worker): add scene writing graph with judge loop

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Job `scenes.generate`, lưu kết quả

**Files:**
- Create: `src/worker/scene-jobs.ts`
- Modify: `src/lib/queue/jobs.ts` (`JOB_TYPES` thêm `"scenes.generate"`), `src/worker/handlers.ts`, `.env.example`

**Interfaces:**
- Consumes: Task 2, `getPool`, `scriptContentSchema`, `loadApprovedCatalog`.
- Produces: handler `generateScenes(payload: { scriptId: string; positions?: number[]; humanFeedback?: Record<string, string> }, ctx)`.

- [ ] **Step 1: Chọn model giám khảo (cần người dùng)**

Gọi `GET {NINE_ROUTER_BASE_URL}/models` (cùng header `Authorization` như `ping`), liệt kê model chat khác họ với `LLM_WRITER_MODEL` (hiện `ag/gemini-3-flash`, họ `gemini`). **Hỏi người dùng chọn** một model (người dùng đã trả lời 2026-10-21: tạm dùng chính `LLM_WRITER_MODEL` làm giám khảo và đặt `LLM_JUDGE_ALLOW_SAME_FAMILY=true`; bỏ qua phần chọn model khác họ cho tới khi có provider mới) (ví dụ họ `claude` hoặc `gpt` nếu router có), thử một lời gọi `chat` nhỏ để chắc nó không trả 404 upstream như `ag/gemini-3.6-flash-medium` đã gặp ở M1, rồi đặt `LLM_JUDGE_MODEL` trong `.env` (người dùng điền; không in giá trị bí mật). Cập nhật comment trong `.env.example` ghi "khác họ với LLM_WRITER_MODEL".

- [ ] **Step 2: Tạo `src/worker/scene-jobs.ts`**

```ts
import { and, eq, inArray } from "drizzle-orm";

import { getDb, getPool } from "@/lib/db/client";
import { scenes, scripts, validations } from "@/lib/db/schema";
import { assertDifferentFamily, RUBRIC_VERSION } from "@/lib/judge/rubric";
import { requireModel } from "@/lib/ninerouter/client";
import type { JobPayload } from "@/lib/queue/jobs";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { planScenes } from "@/lib/scene/plan";
import { scriptContentSchema } from "@/lib/script/schema";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

import { PermanentJobError, type JobContext } from "./job-types";
import { buildSceneGraph, type SceneOutcome } from "./scene-graph";

const CHECKPOINT_SCHEMA = "langgraph";

let saver: PostgresSaver | null = null;
async function getSaver(): Promise<PostgresSaver> {
  if (!saver) {
    await getPool().query(`create schema if not exists ${CHECKPOINT_SCHEMA}`);
    saver = new PostgresSaver(getPool(), undefined, { schema: CHECKPOINT_SCHEMA });
    await saver.setup();
  }
  return saver;
}

// Bước 3: sinh JSON cảnh cho kịch bản đã duyệt. thread_id = jobRunId: job thử lại sẽ chạy tiếp từ checkpoint.
export async function generateScenes(payload: JobPayload, ctx: JobContext) {
  const scriptId = typeof payload.scriptId === "string" ? payload.scriptId : "";
  if (!scriptId) throw new PermanentJobError('Payload thiếu "scriptId"');
  const only = Array.isArray(payload.positions) ? (payload.positions as number[]) : null;
  const humanFeedback = Object.fromEntries(Object.entries((payload.humanFeedback ?? {}) as Record<string, string>).map(([k, v]) => [Number(k), v]));

  const db = getDb();
  const [row] = await db.select().from(scripts).where(eq(scripts.id, scriptId)).limit(1);
  const content = row && scriptContentSchema.safeParse(row.content);
  if (!row || row.status !== "approved" || !content?.success || !content.data.script) {
    throw new PermanentJobError("Kịch bản chưa được duyệt hoặc thiếu nội dung");
  }
  const writerModel = requireModel("LLM_WRITER_MODEL");
  const judgeModel = requireModel("LLM_JUDGE_MODEL");
  let sameFamily = false;
  try {
    sameFamily = assertDifferentFamily(writerModel, judgeModel);
    if (sameFamily) console.warn(JSON.stringify({ event: "judge.same_family", writerModel, judgeModel }));
  } catch (error) {
    throw new PermanentJobError(error instanceof Error ? error.message : String(error));
  }

  const catalog = await loadApprovedCatalog();
  const plans = planScenes(content.data.script).filter((p) => !only || only.includes(p.position));
  const checkpointer = await getSaver();
  const graph = buildSceneGraph({ catalog, writerModel, judgeModel, checkpointer, humanFeedback });
  const config = { configurable: { thread_id: ctx.jobRunId }, recursionLimit: 60 };

  const existing = await graph.getState(config);
  const resumable = existing.next.length > 0;
  const initial = { scenes: Object.fromEntries(plans.map((p) => [p.position, { plan: p, status: "pending", history: [] } satisfies SceneOutcome])) };
  const result = resumable ? await graph.invoke(null, config) : await graph.invoke(initial, config);

  const outcomes = Object.values(result.scenes) as SceneOutcome[];
  const positions = outcomes.map((o) => o.plan.position);
  // Ghi đè các cảnh cùng vị trí (sinh lại); giữ nguyên cảnh khác.
  await db.transaction(async (tx) => {
    const old = await tx.select({ id: scenes.id }).from(scenes).where(and(eq(scenes.scriptId, scriptId), inArray(scenes.position, positions)));
    if (old.length) await tx.delete(scenes).where(inArray(scenes.id, old.map((s) => s.id)));
    for (const o of outcomes) {
      const [created] = await tx
        .insert(scenes)
        .values({
          videoId: row.videoId,
          scriptId,
          position: o.plan.position,
          dsl: o.dsl ?? null,
          dslVersion: 1,
          durationFrames: o.dsl?.durationFrames ?? null,
          status: o.status === "pass" ? "pending_review" : "failed",
        })
        .returning({ id: scenes.id });
      if (o.history.length) {
        await tx.insert(validations).values(
          o.history.map((h) => ({
            targetType: "scene" as const,
            targetId: created.id,
            validatorModel: h.model,
            rubricVersion: h.stage === "judge" ? RUBRIC_VERSION : "l1-scene-v1",
            scores: { round: h.round, stage: h.stage, detail: h.detail, sameFamily: h.stage === "judge" ? sameFamily : undefined },
            verdict: h.verdict,
            feedback: h.feedback,
          })),
        );
      }
    }
  });

  return { scenes: outcomes.length, passed: outcomes.filter((o) => o.status === "pass").length, writerModel, judgeModel };
}
```

Lưu ý: xóa cảnh cũ cùng vị trí cũng xóa `validations` cũ? Không: `validations` tham chiếu đa hình không khóa ngoại nên **lịch sử chấm cảnh cũ vẫn còn** (đúng ý ACE); chỉ trỏ tới `scenes.id` đã bị xóa. Nếu muốn giữ liên kết, đổi sang cập nhật tại chỗ thay vì xóa: quyết định khi code, mặc định giữ cách xóa-chèn cho đơn giản.

- [ ] **Step 3: Đăng ký job và env**

`src/lib/queue/jobs.ts`: thêm `"scenes.generate"` vào `JOB_TYPES`. `src/worker/handlers.ts`: `import { generateScenes } from "./scene-jobs";` và `"scenes.generate": generateScenes,`. `LLM_JUDGE_MODEL` đã có trong `.env.example` và `x-runtime-env`. Thêm `LLM_JUDGE_ALLOW_SAME_FAMILY` (mặc định rỗng) vào cả `.env.example` (kèm ghi chú "ngoại lệ tạm") và anchor `x-runtime-env` theo kiểu `${LLM_JUDGE_ALLOW_SAME_FAMILY:-}`; thêm hai file đó vào `git add` của Task 3 bước 4 (đã có `.env.example`, thêm `docker-compose.yml`).

- [ ] **Step 4: Kiểm tra tĩnh và commit**

Run: `npx tsc --noEmit`, `npm run lint`.

```bash
git add src/worker/scene-jobs.ts src/lib/queue/jobs.ts src/worker/handlers.ts .env.example
git commit -m "feat(worker): add scenes.generate job with checkpointed graph

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Giao diện duyệt cảnh và chạy thật

**Files:**
- Create: `src/lib/scene/queries.ts`, `src/app/scenes/[videoId]/page.tsx`, `src/components/scene/scene-review.tsx`
- Modify: `src/app/scenes/actions.ts` (thêm action), `src/app/videos/[id]/page.tsx` (nút "Sinh phân cảnh"), `src/app/scenes/page.tsx` (danh sách video có cảnh + tỉ lệ đồng thuận), `src/lib/pipeline/steps.ts` (bước 3: `href: "/videos"`; trang chi tiết video là nơi bắt đầu phân cảnh)

**Interfaces:**
- Produces: `listScenes(videoId)` (cảnh + validation mới nhất theo cảnh), `agreementRate()`; server action `startStoryboard(videoId)`, `approveScene(sceneId)`, `rejectScene(sceneId, reason)` (đẩy `scenes.generate` với `positions=[position]` và `humanFeedback`), `approveAllScenes(videoId)`.

- [ ] **Step 1: `startStoryboard`** tạo job `scenes.generate` `{ scriptId }` cho kịch bản `approved` mới nhất của video (từ chối nếu không có hoặc nếu đang có job `scenes.generate` chưa xong cho script đó: kiểm tra `job_runs` theo `target_id`), `enqueueJob(..., { type: "script", id: scriptId })`.

- [ ] **Step 2: `approveScene` / `rejectScene`**: giống `approveScript`/`rejectScript` của M4 (đối tượng `scene`, lý do ≥ 5 ký tự khi loại; loại thì xóa cờ duyệt, ghi `reviews`, đẩy job sinh lại đúng `position` với `humanFeedback`). `approveAllScenes`: duyệt mọi cảnh `pending_review` của video; khi **mọi** cảnh của kịch bản đã `approved` thì `videos.status = "rendering"`.

- [ ] **Step 3: Trang `/scenes/[videoId]`** (`force-dynamic`, UUID hợp lệ): `AutoRefresh` khi job đang chạy; danh sách cảnh theo `position`: `ScenePlayer` (M3) dùng `checkSceneDsl(dsl, catalog)` để lấy `assets`; cạnh đó điểm giám khảo (trung bình, các `blocked`), lỗi lớp 1 của lần cuối, nhận xét; `SceneReview` (duyệt/loại với lý do). Cảnh `failed` hiện lỗi cuối và nút "Sinh lại cảnh này". Trang `/scenes` liệt kê các video có cảnh và hiện `agreementRate()` (đồng thuận giữa verdict giám khảo lần cuối và quyết định người).

- [ ] **Step 4: Bật bước 3** trong `steps.ts` (`href: "/videos"`) và thêm nút "Sinh phân cảnh" vào `/videos/[id]` khi có kịch bản `approved`.

- [ ] **Step 5: Kiểm tra tĩnh và build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`.

- [ ] **Step 6: Chạy thật (tốn nhiều lời gọi, xem Global Constraints)**

Điều kiện: kịch bản `approved` (M4), `LLM_JUDGE_MODEL` khác họ đã đặt, worker Docker cũ đã dừng. Chạy `npm run worker` nền và dev server cổng 3920.
1. Trên `/videos/[id]` bấm "Sinh phân cảnh". Theo dõi `/jobs` và log worker: có `job.start`/`job.succeeded` của `scenes.generate`.
2. DB có schema `langgraph` với các bảng checkpoint; `/scenes/[videoId]` hiện các cảnh với Player chạy được; mỗi cảnh có hàng `validations` (`layer1` và giám khảo).
3. Thử chặn họ model: đặt tạm `LLM_JUDGE_MODEL` bằng model cùng họ với model viết → job `failed` ngay với thông báo "cùng họ" (không tốn credit). Trả `.env` về như cũ.
4. Thử chạy tiếp từ checkpoint: bắt đầu job, `Stop-Process` worker giữa chừng (khi log đã có node `write` xong), chạy lại worker; sau thời gian ẩn 300 giây job được nhận lại và đồ thị chạy tiếp (kiểm tra bằng log: không viết lại cảnh đã `pass`).
5. Loại một cảnh có lý do → job `scenes.generate` mới với `positions=[n]`; lý do nằm trong `humanFeedback` của payload; cảnh được sinh lại.
6. Duyệt hết cảnh → `videos.status` thành `rendering`.
Dừng dev và worker.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scene/queries.ts src/app/scenes src/components/scene/scene-review.tsx src/app/videos src/lib/pipeline/steps.ts
git commit -m "feat(ui): add storyboard review with player and judge scores

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tài liệu

- [ ] **Step 1:** `CLAUDE.md`, thêm vào cuối mục `## Kiến trúc`:

```markdown
- **Phân cảnh (M5):** `planScenes` (tất định) → đồ thị LangGraph `write → check → judge → settle` trong `src/worker/scene-graph.ts`, job `scenes.generate` (`src/worker/scene-jobs.ts`). Checkpoint của `PostgresSaver` nằm trong schema Postgres `langgraph` (tạo bởi `setup()`), `thread_id` = `jobRunId` nên job thử lại chạy tiếp được. Giám khảo (`LLM_JUDGE_MODEL`) bắt buộc khác họ model viết (`assertDifferentFamily`); tiêu chí, ngưỡng đạt 3.5 và `RUBRIC_VERSION` ở `src/lib/judge/rubric.ts`. Thoại trong JSON cảnh phải đúng nguyên văn kịch bản (lớp 1). Mọi lần kiểm lớp 1 và chấm đều ghi `validations`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: describe m5 storyboard graph and judge

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

## Self-review

- **Spec §5 bước 3**: node chia cảnh → viết JSON → kiểm máy → giám khảo, tối đa 2 vòng sửa, `failed` khi quá, `PostgresSaver` ✔. **§6**: G-Eval, khác họ, `rubric_version`, hai chặn cứng, ba tiêu chí điểm, ngưỡng 3.5 trong cấu hình ✔; hiệu chỉnh bằng tỉ lệ đồng thuận ✔. **§8 LangGraph**: chạy tiếp từ checkpoint ✔.
- **§12 dòng TV Parental Guidelines**: được chặn bằng Task 1 bước 1 (không code trên trí nhớ).
- Rủi ro: cú pháp `Annotation` với `reducer`/`default` lấy từ tài liệu chính thức nhưng chưa chạy trong repo (spike chỉ dùng `Annotation()` đơn giản); `tsc` và Task 4 bước 6 sẽ bắt lỗi. Đoạn mã `scene-graph.ts` nêu rõ chỗ cần dọn khi gõ lại.
- Chi phí chạy thật cao nhất trong 5 mốc; người dùng có thể giới hạn bằng kịch bản ngắn (30–60 giây) khi kiểm chứng.
