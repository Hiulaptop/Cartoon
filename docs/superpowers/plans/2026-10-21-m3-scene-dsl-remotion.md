# M3: Khuôn JSON cảnh + component Remotion + Player — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chốt khuôn JSON cảnh (hợp đồng dữ liệu) và dựng nó thành hình bằng component Remotion; xem trước trên trình duyệt bằng Remotion Player. Dùng được ngay bằng trang "Sinh cảnh" (bước 4): dán/sửa JSON, kiểm tra, xem cảnh chạy với asset đã duyệt.

**Architecture:** Khuôn là schema `zod` duy nhất (`src/lib/scene/schema.ts`), dùng chung cho app, worker (M5 để LLM sinh JSON, M6 để render) và bundle Remotion. Kiểm tra máy lớp 1 cho cảnh (`checkSceneDsl`) tra danh mục asset đã duyệt trong DB và trả về bản đồ ảnh đã phân giải. Component `SceneView` (`src/remotion/`) nhận `{dsl, assets, assetMode}`: Player (app) đọc ảnh qua `/api/files/...`, renderer (M6) đọc qua `staticFile`. Không đổi schema DB: cột `scenes.dsl` (jsonb) và `scenes.dsl_version` đã có từ M1.

**Tech Stack:** M1/M2 + `remotion` và `@remotion/player` **4.0.537** (cùng phiên bản chính xác), `zod` ^4.6.7. React 19.1.0 đã xác minh chạy chung với Remotion ở M0.

**Spec:** `docs/superpowers/specs/2026-10-21-cartoon-pipeline-design.md` (§5 "Khuôn JSON cảnh", §12 dòng Remotion + React 19), `docs/standards/asset-naming.md`

## Global Constraints

- Không có test tự động (AGENTS.md luật 4–6). Xác minh bằng `tsc`, lint, build và chạy thật trên trình duyệt.
- **Không đổi schema DB.** Khuôn JSON là hợp đồng dữ liệu (AGENTS.md luật 3): **duyệt plan này = duyệt khuôn ở mục "Khuôn JSON cảnh v1" bên dưới.** Sau khi duyệt, sửa khuôn cần bump `version`.
- Khung hình cố định 1920×1080, 30 fps (số đo M0 dựa trên cấu hình này). Mọi thời gian trong JSON tính bằng **frame**.
- Tham chiếu asset theo `docs/standards/asset-naming.md`: `@chr_minh`, `@bg_lop_hoc.night`. Danh sách trạng thái lấy từ `STATES_BY_KIND` (`src/lib/assets/naming.ts`), không lặp lại.
- Mã chạy trong bundle Remotion (`src/remotion/`, `src/lib/scene/schema.ts`, `src/lib/scene/refs.ts`) **không import DB, `pg`, `sharp`, `fs`**. Chỉ `catalog.ts` và `check.ts` được đụng DB/catalog, và chúng không nằm trong bundle.
- Remotion: mọi gói `remotion`/`@remotion/*` phải cùng phiên bản **chính xác** (`4.0.537`, không `^`).
- Commit theo luật 7, kết thúc bằng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (dòng attribution hệ thống yêu cầu hiện hành).

## Nguồn đã tra (luật 1) — ngày 2026-10-21

| Nội dung | Nguồn | Kết luận |
|---|---|---|
| `Player` nhận `component`, `inputProps`, `durationInFrames`, `compositionWidth/Height`, `fps`, `controls` | context7 `/remotion-dev/remotion` (docs `player`) | Dùng đúng như ví dụ chính thức; `inputProps` nên `useMemo` |
| Ảnh: `<Img>` + `staticFile()` cho file trong `public/`; URL ngoài truyền thẳng vào `src` | context7 (`staticfile`, `static-file-remote-urls`) | Hai chế độ `assetMode: "url" \| "static"` |
| `bundle({ entryPoint, publicDir, webpackOverride })`, `selectComposition`, `renderMedia` | context7 (`ssr-node`, `public-dir`) | Dùng ở M6, không ở M3 |
| `calculateMetadata` tính `durationInFrames` từ props | context7 | Dùng ở M6 cho composition cả video |
| `z.strictObject`, `z.discriminatedUnion`, `z.toJSONSchema()` (zod 4) | context7 `/colinhacks/zod` | Dùng `z.toJSONSchema` để đưa khuôn vào prompt ở M5 |
| `remotion`/`@remotion/player` mới nhất trên npm: 4.0.537; peer `react >=16.8.0` | `npm view` 2026-10-21 | Ghim 4.0.537 |

**Chưa xác minh (rủi ro, kiểm trong Task 4):** Remotion Player chạy đúng dưới Next 15.5.28 + Turbopack (`next dev --turbopack`, `next build --turbopack`). M0 chỉ chạy Remotion ngoài Next.

## Khuôn JSON cảnh v1 (cần duyệt)

Một cảnh = một đối tượng JSON. Mọi khóa lạ bị từ chối (`strictObject`). Thời gian là **frame** (30 fps), tọa độ là **tỉ lệ khung hình**.

| Trường | Kiểu | Ràng buộc | Ý nghĩa |
|---|---|---|---|
| `version` | `1` | literal | Khớp `scenes.dsl_version` |
| `durationFrames` | int | 30–900 (1–30 giây) | Tổng thời lượng cảnh |
| `background.ref` | `@bg_...[.state]` | asset loại `bg` | Nền; không ghi state = `base` |
| `characters[]` | tối đa 4 | | Nhân vật |
| ↳ `id` | `^[a-z][a-z0-9_]{0,23}$` | duy nhất trong cảnh | Khóa để thoại và chuyển động trỏ tới |
| ↳ `ref` | `@chr_...` | **không ghi state** | Asset nhân vật |
| ↳ `x`, `y` | số −0.5…1.5 | | `x`: tâm ngang, `y`: **chân** nhân vật (đáy ảnh), tính theo tỉ lệ khung |
| ↳ `height` | số 0.1…1.2 | | Chiều cao nhân vật theo tỉ lệ chiều cao khung |
| ↳ `flip` | bool, mặc định `false` | | Lật ngang |
| ↳ `states[]` | ≥ 1 | `{at, state}`; phần tử đầu `at = 0`; `at` tăng dần ngặt | Đổi trạng thái theo thời điểm (state thuộc danh sách của `chr`) |
| ↳ `moves[]` | mặc định `[]` | `{from, to, x, y}`; `from < to`; không chồng nhau | Di chuyển mượt tới `(x, y)` |
| `props[]` | tối đa 8, mặc định `[]` | `{id, ref @prop_..[.state], x, y, height, from, to}` | Đạo cụ hiện trong `[from, to)` |
| `effects[]` | tối đa 4, mặc định `[]` | như `props`, `ref @fx_...` | Hiệu ứng hình ảnh |
| `dialogue[]` | tối đa 12, mặc định `[]` | `{speaker, text 1–84 ký tự, from, to}`; `speaker` là `characters[].id`; các câu **không chồng nhau** | Phụ đề (84 = 2 dòng × 42 ký tự, xem M4) |
| `camera[]` | ≥ 1, mặc định 1 khóa | `{at, zoom 1–2.5, fx, fy}`; `at` tăng dần ngặt | Zoom/lia: nội suy tuyến tính giữa các khóa quanh điểm `(fx, fy)` ∈ [0,1] |
| `transition` | mặc định `{in:"cut", out:"cut", frames:12}` | `in`/`out` ∈ `cut`\|`fade`; `frames` 6–30; `2·frames ≤ durationFrames` | `fade` = mờ từ/ra đen ngay trong cảnh (thời lượng video = tổng các cảnh) |

**Quy ước dựng hình (không nằm trong JSON):**
- Khi một nhân vật đang nói (`dialogue.speaker`) và asset có cả `talk_a` lẫn `talk_b` đã duyệt, hệ thống luân phiên hai trạng thái đó mỗi 5 frame; nếu thiếu thì giữ trạng thái hiện tại.
- Thứ tự lớp: nền → hiệu ứng → đạo cụ → nhân vật (sắp theo `y`, nhỏ vẽ trước) → phụ đề. Camera chỉ tác động lên nền, đạo cụ, hiệu ứng, nhân vật; phụ đề đứng yên.
- Phụ đề: giữa đáy khung, chữ trắng viền đen, tối đa 2 dòng.

**Kiểm tra máy lớp 1 cho cảnh (M3 làm phần cấu trúc; tốc độ đọc phụ đề thêm ở M4/M5):**
1. Đúng khuôn (zod). 2. `id` duy nhất toàn cảnh. 3. Mọi `ref` trỏ tới asset **đã duyệt**, đúng loại, state thuộc danh sách, và biến thể đó **đã duyệt có ảnh**. 4. Mọi mốc thời gian nằm trong `[0, durationFrames]`, `from < to`. 5. `speaker` tồn tại. 6. Thoại không chồng nhau. 7. Khóa camera và state tăng dần ngặt.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/lib/scene/schema.ts` | Schema zod, hằng `FPS/WIDTH/HEIGHT`, `parseSceneDsl()`, kiểu `SceneDsl`, `ResolvedAssets` |
| `src/lib/scene/refs.ts` | `parseRef()`, `assetKey()`: thuần, không import DB |
| `src/lib/scene/catalog.ts` | `loadApprovedCatalog()`: asset + biến thể đã duyệt từ DB |
| `src/lib/scene/check.ts` | `checkSceneDsl(dsl, catalog)` → `{issues, assets}` |
| `src/lib/scene/sample.ts` | `sampleSceneDsl(catalog)`: cảnh mẫu từ asset đã duyệt |
| `src/remotion/SceneView.tsx` | Composition của một cảnh (nền, nhân vật, đạo cụ, hiệu ứng, camera, chuyển cảnh, phụ đề) |
| `src/remotion/helpers.ts` | Hàm thuần: trạng thái tại frame, vị trí tại frame, camera tại frame |
| `src/components/scene/scene-player.tsx` | Client component bọc `@remotion/player` |
| `src/app/scenes/page.tsx`, `src/app/scenes/playground/page.tsx`, `src/app/scenes/actions.ts` | Trang bước 4 + sân thử JSON |
| `src/components/scene/playground-form.tsx` | Form dán JSON, nút "Dùng mẫu"/"Xem trước" |
| `src/lib/pipeline/steps.ts` (sửa) | Bật bước 4 (`href: "/scenes"`) |

---

### Task 1: Hợp đồng dữ liệu (schema + refs)

**Files:**
- Create: `src/lib/scene/schema.ts`, `src/lib/scene/refs.ts`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**
- Produces: `FPS`, `WIDTH`, `HEIGHT`, `MAX_SCENE_FRAMES`, `sceneDslSchema`, `type SceneDsl`, `type SceneCharacter`, `type SceneItem`, `type SceneDialogue`, `type ResolvedAsset`, `type ResolvedAssets`, `parseSceneDsl(input: unknown): { ok: true; dsl: SceneDsl } | { ok: false; issues: string[] }`; `parseRef(raw: string): ParsedRef | null`, `assetKey(name: string, state: string): string`, `defaultState(kind: AssetKind): string`, `characterId(refOrName: string): string`.

- [ ] **Step 1: Cài phụ thuộc (ghim chính xác Remotion)**

Run: `npm install --save-exact remotion@4.0.537 @remotion/player@4.0.537` rồi `npm install zod@^4.6.7`.
Expected: `package.json` có `"remotion": "4.0.537"`, `"@remotion/player": "4.0.537"`, `"zod": "^4.6.7"`; không cảnh báo peer dependency về React.

- [ ] **Step 2: Tạo `src/lib/scene/refs.ts`**

```ts
import { ASSET_KINDS, type AssetKind } from "@/lib/assets/naming";

export type ParsedRef = { name: string; kind: AssetKind; state: string | null };

const REF_RE = /^@((chr|bg|prop|fx)_[a-z0-9]+(?:_[a-z0-9]+)*)(?:\.([a-z0-9]+(?:_[a-z0-9]+)*))?$/;

// "@chr_minh.happy" -> { name: "chr_minh", kind: "chr", state: "happy" }. Sai chuẩn thì null.
export function parseRef(raw: string): ParsedRef | null {
  const m = REF_RE.exec(raw);
  if (!m) return null;
  const kind = m[2] as AssetKind;
  if (!ASSET_KINDS.includes(kind)) return null;
  return { name: m[1], kind, state: m[3] ?? null };
}

// Khóa của bản đồ ảnh đã phân giải: "chr_minh.happy".
export function assetKey(name: string, state: string): string {
  return `${name}.${state}`;
}

// Chuẩn đặt tên: không ghi state nghĩa là idle với chr, base với các loại khác.
export function defaultState(kind: AssetKind): string {
  return kind === "chr" ? "idle" : "base";
}

// id nhân vật trong cảnh: tên asset bỏ "chr_", tối đa 24 ký tự, bắt đầu bằng chữ. Prompt (M5) và sample dùng chung.
export function characterId(refOrName: string): string {
  const name = refOrName.replace(/^@/, "").replace(/^chr_/, "").slice(0, 24);
  return /^[a-z]/.test(name) ? name : `c${name}`.slice(0, 24);
}
```

- [ ] **Step 3: Tạo `src/lib/scene/schema.ts`**

```ts
import * as z from "zod";

// Khuôn JSON cảnh v1. Sửa khuôn = bump version + được duyệt (AGENTS.md luật 3).
export const SCENE_DSL_VERSION = 1;
export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
export const MAX_SCENE_FRAMES = FPS * 30;

const NAME = "[a-z0-9]+(?:_[a-z0-9]+)*";
const id = z.string().regex(/^[a-z][a-z0-9_]{0,23}$/, "id: chữ thường, số, _; bắt đầu bằng chữ; tối đa 24 ký tự");
const frame = z.int().min(0).max(MAX_SCENE_FRAMES);
const coord = z.number().min(-0.5).max(1.5);
const stateName = z.string().regex(new RegExp(`^${NAME}$`));
const refWithState = (kind: "bg" | "prop" | "fx") =>
  z.string().regex(new RegExp(`^@${kind}_${NAME}(?:\\.${NAME})?$`), `ref phải dạng @${kind}_ten hoặc @${kind}_ten.trang_thai`);

const character = z.strictObject({
  id,
  ref: z.string().regex(new RegExp(`^@chr_${NAME}$`), "ref nhân vật không ghi trạng thái: @chr_ten"),
  x: coord,
  y: coord,
  height: z.number().min(0.1).max(1.2),
  flip: z.boolean().default(false),
  states: z.array(z.strictObject({ at: frame, state: stateName })).min(1),
  moves: z.array(z.strictObject({ from: frame, to: frame, x: coord, y: coord })).default([]),
});

const item = (kind: "prop" | "fx") =>
  z.strictObject({ id, ref: refWithState(kind), x: coord, y: coord, height: z.number().min(0.05).max(1.2), from: frame, to: frame });

const dialogue = z.strictObject({
  speaker: id,
  // 84 = 2 dòng × 42 ký tự (Netflix English Timed Text Style Guide), xem M4.
  text: z.string().min(1).max(84),
  from: frame,
  to: frame,
});

const cameraKey = z.strictObject({
  at: frame,
  zoom: z.number().min(1).max(2.5),
  fx: z.number().min(0).max(1),
  fy: z.number().min(0).max(1),
});

export const sceneDslSchema = z.strictObject({
  version: z.literal(SCENE_DSL_VERSION),
  durationFrames: z.int().min(FPS).max(MAX_SCENE_FRAMES),
  background: z.strictObject({ ref: refWithState("bg") }),
  characters: z.array(character).max(4),
  props: z.array(item("prop")).max(8).default([]),
  effects: z.array(item("fx")).max(4).default([]),
  dialogue: z.array(dialogue).max(12).default([]),
  camera: z.array(cameraKey).min(1).default([{ at: 0, zoom: 1, fx: 0.5, fy: 0.5 }]),
  transition: z
    .strictObject({
      in: z.enum(["cut", "fade"]),
      out: z.enum(["cut", "fade"]),
      frames: z.int().min(6).max(30),
    })
    .default({ in: "cut", out: "cut", frames: 12 }),
});

export type SceneDsl = z.output<typeof sceneDslSchema>;
export type SceneCharacter = SceneDsl["characters"][number];
export type SceneItem = SceneDsl["props"][number];
export type SceneDialogue = SceneDsl["dialogue"][number];

// Ảnh đã phân giải theo khóa "chr_minh.happy". `path` tính từ DATA_DIR.
export type ResolvedAsset = { path: string; width: number; height: number };
export type ResolvedAssets = Record<string, ResolvedAsset>;

export function parseSceneDsl(input: unknown): { ok: true; dsl: SceneDsl } | { ok: false; issues: string[] } {
  const result = sceneDslSchema.safeParse(input);
  if (result.success) return { ok: true, dsl: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((i) => `${i.path.length ? i.path.join(".") : "(gốc)"}: ${i.message}`),
  };
}
```

- [ ] **Step 4: Kiểm tra tĩnh và commit**

Run: `npx tsc --noEmit` và `npm run lint` → không lỗi.

```bash
git add package.json package-lock.json src/lib/scene/schema.ts src/lib/scene/refs.ts
git commit -m "feat(scene): add scene dsl v1 schema and ref parsing

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Danh mục asset, kiểm tra lớp 1, cảnh mẫu

**Files:**
- Create: `src/lib/scene/catalog.ts`, `src/lib/scene/check.ts`, `src/lib/scene/sample.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces: `type Catalog = Map<string, CatalogAsset>` (khóa = tên asset); `loadApprovedCatalog(): Promise<Catalog>`; `checkSceneDsl(dsl: SceneDsl, catalog: Catalog): { issues: string[]; assets: ResolvedAssets }`; `sampleSceneDsl(catalog: Catalog): SceneDsl | null`.

- [ ] **Step 1: Tạo `src/lib/scene/catalog.ts`**

```ts
import { and, eq, isNotNull } from "drizzle-orm";

import type { AssetKind } from "@/lib/assets/naming";
import { getDb } from "@/lib/db/client";
import { assets, assetVariants } from "@/lib/db/schema";

export type CatalogVariant = { path: string; width: number; height: number };
export type CatalogAsset = {
  id: string;
  name: string;
  kind: AssetKind;
  displayName: string;
  description: string;
  variants: Map<string, CatalogVariant>;
};
// Khóa = tên asset ("chr_minh"). Chỉ gồm asset đã duyệt và biến thể đã duyệt có ảnh.
export type Catalog = Map<string, CatalogAsset>;

export async function loadApprovedCatalog(): Promise<Catalog> {
  const rows = await getDb()
    .select({ asset: assets, variant: assetVariants })
    .from(assets)
    .innerJoin(assetVariants, eq(assetVariants.assetId, assets.id))
    .where(
      and(
        eq(assets.status, "approved"),
        eq(assetVariants.status, "approved"),
        isNotNull(assetVariants.filePath),
        isNotNull(assetVariants.width),
        isNotNull(assetVariants.height),
      ),
    );
  const catalog: Catalog = new Map();
  for (const { asset, variant } of rows) {
    let entry = catalog.get(asset.name);
    if (!entry) {
      entry = {
        id: asset.id,
        name: asset.name,
        kind: asset.kind,
        displayName: asset.displayName,
        description: asset.description,
        variants: new Map(),
      };
      catalog.set(asset.name, entry);
    }
    entry.variants.set(variant.state, { path: variant.filePath!, width: variant.width!, height: variant.height! });
  }
  return catalog;
}
```

- [ ] **Step 2: Tạo `src/lib/scene/check.ts`**

```ts
import { isAllowedState } from "@/lib/assets/naming";

import type { Catalog } from "./catalog";
import { assetKey, defaultState, parseRef } from "./refs";
import type { ResolvedAssets, SceneDsl } from "./schema";

// Kiểm tra máy lớp 1 cho cảnh (spec §6): cấu trúc + tham chiếu asset. Không dùng LLM.
export function checkSceneDsl(dsl: SceneDsl, catalog: Catalog): { issues: string[]; assets: ResolvedAssets } {
  const issues: string[] = [];
  const assets: ResolvedAssets = {};
  const end = dsl.durationFrames;

  function useAsset(where: string, raw: string, explicitState?: string) {
    const ref = parseRef(raw);
    if (!ref) return issues.push(`${where}: tham chiếu sai chuẩn "${raw}"`);
    const asset = catalog.get(ref.name);
    if (!asset) return issues.push(`${where}: ${raw} không phải asset đã duyệt`);
    const state = explicitState ?? ref.state ?? defaultState(ref.kind);
    if (!isAllowedState(ref.kind, state)) return issues.push(`${where}: trạng thái "${state}" không hợp lệ cho ${ref.kind}`);
    const variant = asset.variants.get(state);
    if (!variant) return issues.push(`${where}: ${ref.name}.${state} chưa có ảnh đã duyệt (cần sinh và duyệt biến thể)`);
    assets[assetKey(ref.name, state)] = variant;
  }

  function inRange(where: string, from: number, to: number) {
    if (from >= to) issues.push(`${where}: from (${from}) phải nhỏ hơn to (${to})`);
    if (to > end) issues.push(`${where}: to (${to}) vượt durationFrames (${end})`);
  }

  const ids = new Set<string>();
  const unique = (id: string, where: string) => {
    if (ids.has(id)) issues.push(`${where}: id "${id}" bị trùng`);
    ids.add(id);
  };

  useAsset("background", dsl.background.ref);

  dsl.characters.forEach((c, i) => {
    const where = `characters[${i}] (${c.id})`;
    unique(c.id, where);
    if (c.states[0].at !== 0) issues.push(`${where}: states[0].at phải bằng 0`);
    c.states.forEach((s, k) => {
      if (k > 0 && s.at <= c.states[k - 1].at) issues.push(`${where}: states[${k}].at phải lớn hơn khóa trước`);
      if (s.at >= end) issues.push(`${where}: states[${k}].at (${s.at}) ngoài cảnh`);
      useAsset(`${where}.states[${k}]`, c.ref, s.state);
    });
    // Trạng thái nói được dựng tự động nếu đủ cả hai ảnh; không ép phải có.
    for (const talk of ["talk_a", "talk_b"]) {
      const asset = catalog.get(c.ref.slice(1));
      const variant = asset?.variants.get(talk);
      if (variant) assets[assetKey(c.ref.slice(1), talk)] = variant;
    }
    c.moves.forEach((m, k) => {
      inRange(`${where}.moves[${k}]`, m.from, m.to);
      if (k > 0 && m.from < c.moves[k - 1].to) issues.push(`${where}.moves[${k}]: chồng lên chuyển động trước`);
    });
  });

  for (const [list, items] of [["props", dsl.props], ["effects", dsl.effects]] as const) {
    items.forEach((it, i) => {
      const where = `${list}[${i}] (${it.id})`;
      unique(it.id, where);
      inRange(where, it.from, it.to);
      useAsset(where, it.ref);
    });
  }

  const speakers = new Set(dsl.characters.map((c) => c.id));
  const lines = [...dsl.dialogue].sort((a, b) => a.from - b.from);
  dsl.dialogue.forEach((d, i) => {
    const where = `dialogue[${i}]`;
    inRange(where, d.from, d.to);
    if (!speakers.has(d.speaker)) issues.push(`${where}: speaker "${d.speaker}" không có trong characters`);
  });
  lines.forEach((d, i) => {
    if (i > 0 && d.from < lines[i - 1].to) issues.push(`dialogue: câu "${d.text.slice(0, 20)}…" chồng lên câu trước`);
  });

  dsl.camera.forEach((k, i) => {
    if (k.at >= end) issues.push(`camera[${i}].at (${k.at}) ngoài cảnh`);
    if (i > 0 && k.at <= dsl.camera[i - 1].at) issues.push(`camera[${i}].at phải lớn hơn khóa trước`);
  });

  if (dsl.transition.frames * 2 > end) issues.push("transition.frames * 2 vượt durationFrames");

  return { issues, assets };
}
```

- [ ] **Step 3: Tạo `src/lib/scene/sample.ts`**

```ts
import { characterId, defaultState } from "./refs";
import type { Catalog } from "./catalog";
import { FPS, SCENE_DSL_VERSION, type SceneDsl } from "./schema";

// Cảnh mẫu 6 giây từ asset đã duyệt: 1 nền + tối đa 2 nhân vật. null nếu thiếu nền hoặc nhân vật.
export function sampleSceneDsl(catalog: Catalog): SceneDsl | null {
  const all = [...catalog.values()];
  const bg = all.find((a) => a.kind === "bg");
  const chars = all.filter((a) => a.kind === "chr").slice(0, 2);
  if (!bg || chars.length === 0) return null;

  const pickState = (variants: Map<string, unknown>) => (variants.has(defaultState("chr")) ? "idle" : "base");
  const bgState = bg.variants.has("base") ? undefined : [...bg.variants.keys()][0];
  const duration = 6 * FPS;

  return {
    version: SCENE_DSL_VERSION,
    durationFrames: duration,
    background: { ref: bgState ? `@${bg.name}.${bgState}` : `@${bg.name}` },
    characters: chars.map((c, i) => ({
      id: characterId(c.name),
      ref: `@${c.name}`,
      x: chars.length === 1 ? 0.5 : i === 0 ? 0.3 : 0.7,
      y: 0.92,
      height: 0.6,
      flip: i === 1,
      states: [{ at: 0, state: pickState(c.variants) }, ...(c.variants.has("happy") ? [{ at: 3 * FPS, state: "happy" }] : [])],
      moves: [],
    })),
    props: [],
    effects: [],
    dialogue: [
      { speaker: characterId(chars[0].name), text: "Hello! This is a test scene.", from: FPS, to: 3 * FPS },
    ],
    camera: [
      { at: 0, zoom: 1, fx: 0.5, fy: 0.5 },
      { at: duration - 1, zoom: 1.15, fx: 0.5, fy: 0.6 },
    ],
    transition: { in: "fade", out: "fade", frames: 12 },
  };
}
```

- [ ] **Step 4: Kiểm tra tĩnh và commit**

Run: `npx tsc --noEmit` và `npm run lint` → không lỗi.

```bash
git add src/lib/scene/catalog.ts src/lib/scene/check.ts src/lib/scene/sample.ts
git commit -m "feat(scene): add approved catalog, layer-1 check and sample scene

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Component Remotion

**Files:**
- Create: `src/remotion/helpers.ts`, `src/remotion/SceneView.tsx`

**Interfaces:**
- Consumes: `SceneDsl`, `ResolvedAssets`, `FPS/WIDTH/HEIGHT`, `assetKey`, `parseRef`, `defaultState`.
- Produces: `SceneView` và `type SceneViewProps = { dsl: SceneDsl; assets: ResolvedAssets; assetMode: "url" | "static" }`. M6 dùng lại `SceneView` bên trong composition cả video.

- [ ] **Step 1: Tạo `src/remotion/helpers.ts`** (hàm thuần, dễ đọc)

```ts
import { interpolate, Easing } from "remotion";

import type { SceneCharacter, SceneDsl } from "@/lib/scene/schema";

export const TALK_FRAMES = 5;

// Trạng thái ảnh của nhân vật tại frame: khóa states gần nhất, ghi đè bằng talk_a/talk_b khi đang nói.
export function stateAt(c: SceneCharacter, dialogue: SceneDsl["dialogue"], frame: number, has: (state: string) => boolean): string {
  const keyed = [...c.states].reverse().find((s) => s.at <= frame)?.state ?? c.states[0].state;
  const line = dialogue.find((d) => d.speaker === c.id && frame >= d.from && frame < d.to);
  if (line && has("talk_a") && has("talk_b")) return Math.floor((frame - line.from) / TALK_FRAMES) % 2 === 0 ? "talk_a" : "talk_b";
  return keyed;
}

// Vị trí chân nhân vật tại frame: đi tuần tự qua các moves, mượt (ease in-out).
export function positionAt(c: SceneCharacter, frame: number): { x: number; y: number } {
  let pos = { x: c.x, y: c.y };
  for (const m of [...c.moves].sort((a, b) => a.from - b.from)) {
    if (frame < m.from) break;
    const t = Math.min(1, (frame - m.from) / (m.to - m.from));
    const e = Easing.inOut(Easing.ease)(t);
    pos = { x: pos.x + (m.x - pos.x) * e, y: pos.y + (m.y - pos.y) * e };
    if (t < 1) break;
  }
  return pos;
}

export function cameraAt(camera: SceneDsl["camera"], frame: number): { zoom: number; fx: number; fy: number } {
  if (camera.length === 1) return camera[0];
  const at = camera.map((k) => k.at);
  const lerp = (pick: (k: SceneDsl["camera"][number]) => number) =>
    interpolate(frame, at, camera.map(pick), { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { zoom: lerp((k) => k.zoom), fx: lerp((k) => k.fx), fy: lerp((k) => k.fy) };
}

// Độ mờ do chuyển cảnh `fade` (1 = rõ hoàn toàn).
export function fadeAt(t: SceneDsl["transition"], frame: number, duration: number): number {
  const fadeIn = t.in === "fade" ? interpolate(frame, [0, t.frames], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const fadeOut = t.out === "fade" ? interpolate(frame, [duration - t.frames, duration], [1, 0], { extrapolateLeft: "clamp" }) : 1;
  return Math.min(fadeIn, fadeOut);
}
```

- [ ] **Step 2: Tạo `src/remotion/SceneView.tsx`**

```tsx
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";

import { assetKey, defaultState, parseRef } from "@/lib/scene/refs";
import { HEIGHT, WIDTH, type ResolvedAsset, type ResolvedAssets, type SceneDsl, type SceneItem } from "@/lib/scene/schema";

import { cameraAt, fadeAt, positionAt, stateAt } from "./helpers";

export type SceneViewProps = {
  dsl: SceneDsl;
  assets: ResolvedAssets;
  // "url": Player trong app (đọc qua /api/files). "static": renderer (file nằm trong publicDir của bundle, M6).
  assetMode: "url" | "static";
};

const src = (mode: SceneViewProps["assetMode"], path: string) => (mode === "static" ? staticFile(path) : `/api/files/${path}`);

function lookup(assets: ResolvedAssets, raw: string, state?: string): ResolvedAsset | undefined {
  const ref = parseRef(raw);
  if (!ref) return undefined;
  return assets[assetKey(ref.name, state ?? ref.state ?? defaultState(ref.kind))];
}

// Đặt ảnh theo tâm-chân: (x, y) là tâm ngang và đáy ảnh, height theo chiều cao khung.
function Sprite({ asset, mode, x, y, height, flip }: { asset: ResolvedAsset; mode: SceneViewProps["assetMode"]; x: number; y: number; height: number; flip?: boolean }) {
  const h = height * HEIGHT;
  const w = h * (asset.width / asset.height);
  return (
    <Img
      src={src(mode, asset.path)}
      style={{
        position: "absolute",
        left: x * WIDTH - w / 2,
        top: y * HEIGHT - h,
        width: w,
        height: h,
        transform: flip ? "scaleX(-1)" : undefined,
      }}
    />
  );
}

function Floating({ item, assets, mode, frame }: { item: SceneItem; assets: ResolvedAssets; mode: SceneViewProps["assetMode"]; frame: number }) {
  if (frame < item.from || frame >= item.to) return null;
  const asset = lookup(assets, item.ref);
  return asset ? <Sprite asset={asset} mode={mode} x={item.x} y={item.y} height={item.height} /> : null;
}

export const SceneView: React.FC<SceneViewProps> = ({ dsl, assets, assetMode }) => {
  const frame = useCurrentFrame();
  const cam = cameraAt(dsl.camera, frame);
  const bg = lookup(assets, dsl.background.ref);
  const caption = dsl.dialogue.find((d) => frame >= d.from && frame < d.to);
  const characters = [...dsl.characters].sort((a, b) => positionAt(a, frame).y - positionAt(b, frame).y);

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <AbsoluteFill style={{ opacity: fadeAt(dsl.transition, frame, dsl.durationFrames) }}>
        <AbsoluteFill style={{ transform: `scale(${cam.zoom})`, transformOrigin: `${cam.fx * 100}% ${cam.fy * 100}%` }}>
          {bg && <Img src={src(assetMode, bg.path)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          {dsl.effects.map((e) => (
            <Floating key={e.id} item={e} assets={assets} mode={assetMode} frame={frame} />
          ))}
          {dsl.props.map((p) => (
            <Floating key={p.id} item={p} assets={assets} mode={assetMode} frame={frame} />
          ))}
          {characters.map((c) => {
            const state = stateAt(c, dsl.dialogue, frame, (s) => lookup(assets, c.ref, s) !== undefined);
            const asset = lookup(assets, c.ref, state);
            const pos = positionAt(c, frame);
            return asset ? <Sprite key={c.id} asset={asset} mode={assetMode} x={pos.x} y={pos.y} height={c.height} flip={c.flip} /> : null;
          })}
        </AbsoluteFill>
        {caption && (
          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 70 }}>
            <div
              style={{
                maxWidth: 1500,
                padding: "10px 24px",
                borderRadius: 12,
                background: "rgba(0,0,0,0.35)",
                color: "white",
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: 52,
                lineHeight: 1.25,
                textAlign: "center",
                whiteSpace: "pre-wrap",
                textShadow: "-3px 0 black, 3px 0 black, 0 -3px black, 0 3px black",
              }}
            >
              {caption.text}
            </div>
          </AbsoluteFill>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 3: Kiểm tra tĩnh và commit**

Run: `npx tsc --noEmit` và `npm run lint` → không lỗi.

```bash
git add src/remotion/helpers.ts src/remotion/SceneView.tsx
git commit -m "feat(remotion): add scene composition

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Trang "Sinh cảnh" (sân thử JSON) và xác minh Player

**Files:**
- Create: `src/components/scene/scene-player.tsx`, `src/components/scene/playground-form.tsx`, `src/app/scenes/actions.ts`, `src/app/scenes/page.tsx`, `src/app/scenes/playground/page.tsx`
- Modify: `src/lib/pipeline/steps.ts` (bước 4: thêm `href: "/scenes"`), `CLAUDE.md`, `README.md`

- [ ] **Step 1: Tạo `src/components/scene/scene-player.tsx`**

```tsx
"use client";

import { Player } from "@remotion/player";
import { useMemo } from "react";

import { FPS, HEIGHT, WIDTH, type ResolvedAssets, type SceneDsl } from "@/lib/scene/schema";
import { SceneView } from "@/remotion/SceneView";

export function ScenePlayer({ dsl, assets }: { dsl: SceneDsl; assets: ResolvedAssets }) {
  const inputProps = useMemo(() => ({ dsl, assets, assetMode: "url" as const }), [dsl, assets]);
  return (
    <Player
      component={SceneView}
      inputProps={inputProps}
      durationInFrames={dsl.durationFrames}
      compositionWidth={WIDTH}
      compositionHeight={HEIGHT}
      fps={FPS}
      controls
      style={{ width: "100%", aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    />
  );
}
```

- [ ] **Step 2: Tạo `src/app/scenes/actions.ts`**

```ts
"use server";

import { errorMessage } from "@/lib/errors";
import { loadApprovedCatalog } from "@/lib/scene/catalog";
import { checkSceneDsl } from "@/lib/scene/check";
import { sampleSceneDsl } from "@/lib/scene/sample";
import { parseSceneDsl, type ResolvedAssets, type SceneDsl } from "@/lib/scene/schema";

export type PlaygroundState = {
  json: string;
  issues: string[];
  preview?: { dsl: SceneDsl; assets: ResolvedAssets };
};

export async function playground(_prev: PlaygroundState, formData: FormData): Promise<PlaygroundState> {
  const intent = String(formData.get("intent") ?? "preview");
  const json = String(formData.get("json") ?? "");
  try {
    const catalog = await loadApprovedCatalog();
    if (intent === "sample") {
      const sample = sampleSceneDsl(catalog);
      if (!sample) return { json, issues: ["Cần ít nhất 1 bối cảnh (bg_) và 1 nhân vật (chr_) đã duyệt ở bước 1 để tạo cảnh mẫu."] };
      return { json: JSON.stringify(sample, null, 2), issues: [] };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      return { json, issues: [`JSON sai cú pháp: ${errorMessage(error)}`] };
    }
    const result = parseSceneDsl(parsed);
    if (!result.ok) return { json, issues: result.issues };
    const checked = checkSceneDsl(result.dsl, catalog);
    if (checked.issues.length) return { json, issues: checked.issues };
    return { json, issues: [], preview: { dsl: result.dsl, assets: checked.assets } };
  } catch (error) {
    return { json, issues: [`Lỗi: ${errorMessage(error)}`] };
  }
}
```

- [ ] **Step 3: Tạo `src/components/scene/playground-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";

import { playground, type PlaygroundState } from "@/app/scenes/actions";
import { ScenePlayer } from "@/components/scene/scene-player";
import { Button } from "@/components/ui/button";

export function PlaygroundForm() {
  const [state, action, pending] = useActionState<PlaygroundState, FormData>(playground, { json: "", issues: [] });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} className="flex flex-col gap-3">
        <textarea
          key={state.json}
          name="json"
          defaultValue={state.json}
          rows={28}
          spellCheck={false}
          className="rounded-lg border border-input bg-transparent p-3 font-mono text-xs"
          placeholder="Dán JSON cảnh v1 hoặc bấm “Dùng mẫu”"
        />
        <div className="flex gap-2">
          <Button type="submit" name="intent" value="preview" disabled={pending}>
            Kiểm tra và xem trước
          </Button>
          <Button type="submit" name="intent" value="sample" variant="outline" disabled={pending}>
            Dùng mẫu
          </Button>
        </div>
        {state.issues.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
            {state.issues.map((issue) => (
              <li key={issue} className="break-words">
                {issue}
              </li>
            ))}
          </ul>
        )}
      </form>
      <div>
        {state.preview ? (
          <ScenePlayer dsl={state.preview.dsl} assets={state.preview.assets} />
        ) : (
          <p className="text-sm text-muted-foreground">Bản xem trước hiện ở đây khi JSON qua được bước kiểm tra.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Tạo hai trang**

`src/app/scenes/page.tsx`:

```tsx
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function ScenesPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">4. Sinh cảnh</h1>
      <p className="text-sm text-muted-foreground">
        JSON cảnh do bước 3 (M5) sinh ra được dựng hình bằng Remotion và xem trước ngay trên trình duyệt. Cảnh theo từng video sẽ hiện ở đây sau M5.
      </p>
      <Card>
        <CardHeader>
          <CardTitle>Sân thử JSON cảnh</CardTitle>
          <CardDescription>Dán hoặc sửa JSON, kiểm tra theo khuôn v1 và asset đã duyệt, rồi xem cảnh chạy.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/scenes/playground" className="text-sm underline">
            Mở sân thử →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/app/scenes/playground/page.tsx`:

```tsx
import Link from "next/link";

import { PlaygroundForm } from "@/components/scene/playground-form";

export default function PlaygroundPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Link href="/scenes" className="text-sm text-muted-foreground hover:underline">
          ← Sinh cảnh
        </Link>
        <h1 className="text-2xl font-semibold">Sân thử JSON cảnh</h1>
        <p className="text-sm text-muted-foreground">Khuôn v1: 1920×1080, 30 fps, thời gian tính bằng frame.</p>
      </div>
      <PlaygroundForm />
    </div>
  );
}
```

- [ ] **Step 5: Bật bước 4 trong `src/lib/pipeline/steps.ts`**

Dòng bước 4 thêm `href: "/scenes"`:

```ts
  { number: 4, title: "Sinh cảnh", description: "Xem trước cảnh bằng Remotion", milestone: "M3", href: "/scenes" },
```

- [ ] **Step 6: Kiểm tra tĩnh và build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Expected: không lỗi; `/scenes` và `/scenes/playground` có trong bảng route. Nếu build lỗi vì Remotion + Turbopack, **dừng và báo** (rủi ro đã nêu ở đầu plan), không đổi sang webpack khi chưa hỏi.

- [ ] **Step 7: Chạy thật (không tốn credit nếu đã có asset)**

Điều kiện: có ít nhất 1 `bg_` và 1 `chr_` **đã duyệt** (hiện DB chỉ có `chr_minh`; nếu thiếu bối cảnh thì tạo 1 bối cảnh qua `/assets`: tốn 1 lời gọi LLM + 1 ảnh).
1. `npx next dev --turbopack -H 127.0.0.1 -p 3920`, mở `/scenes/playground`.
2. Bấm "Dùng mẫu" → JSON hiện trong ô. Bấm "Kiểm tra và xem trước" → Player hiện cảnh, bấm Play: nhân vật đứng đúng chỗ, phụ đề hiện 1–3 giây, camera zoom nhẹ, mờ vào/ra.
3. Sửa JSON cho sai ba kiểu và xác nhận báo lỗi tiếng Việt, không crash: (a) thêm khóa lạ `"foo": 1`; (b) đổi `ref` thành `@chr_khong_co`; (c) đặt `dialogue[0].to` lớn hơn `durationFrames`.
4. Kiểm tra console trình duyệt không có lỗi hydration hay lỗi Remotion.
Dừng dev.

- [ ] **Step 8: Cập nhật tài liệu và commit**

`CLAUDE.md`, thêm vào cuối mục `## Kiến trúc`:

```markdown
- **Khuôn JSON cảnh (M3):** `src/lib/scene/schema.ts` là hợp đồng dữ liệu duy nhất (zod, `version: 1`, 1920×1080, 30 fps, thời gian bằng frame). `checkSceneDsl` (lớp 1) tra asset đã duyệt trong DB. Component Remotion ở `src/remotion/` dùng chung cho Player (app, `assetMode: "url"`) và renderer (M6, `assetMode: "static"`); mã trong bundle Remotion không được import DB, `pg`, `sharp`, `fs`. Mọi gói `remotion`/`@remotion/*` ghim cùng phiên bản chính xác (4.0.537).
```

`README.md`, bảng "Cấu trúc chính", thêm: `| `src/lib/scene/`, `src/remotion/` | Khuôn JSON cảnh, kiểm tra, component dựng hình |`.

```bash
git add src/components/scene src/app/scenes src/lib/pipeline/steps.ts
git commit -m "feat(ui): add scene playground with remotion player

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git add CLAUDE.md README.md
git commit -m "docs: describe scene dsl and remotion layer

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

## Self-review

- **Spec §5 "Khuôn JSON cảnh"**: bối cảnh ✔, nhân vật vị trí/kích thước/đổi trạng thái ✔, thoại người nói/nội dung/thời điểm ✔, camera zoom/lia ✔, chuyển cảnh ✔, tổng thời lượng ✔, `dsl_version` ✔.
- **§12 Remotion + React 19**: đã xác minh ở M0; Task 4 xác minh thêm dưới Next.
- Tên dùng xuyên suốt: `SceneDsl`, `ResolvedAssets`, `assetKey`, `Catalog`, `checkSceneDsl`, `SceneViewProps`.
- Tốc độ đọc phụ đề **không** kiểm ở M3 (cần ngưỡng đã xác minh ở M4); khuôn đã giới hạn 84 ký tự/câu.
