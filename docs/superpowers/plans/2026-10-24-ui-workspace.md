# Workspace bài giảng và khung UI: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Luật repo thắng skill:** AGENTS.md luật 4-6 cấm tự viết và tự chạy test. Plan này **không có bước test**; mỗi task được xác minh bằng `npm run lint`, `npx tsc --noEmit` và (cuối task lớn) `npm run build`, rồi xem trên trình duyệt.

**Goal:** Thay trang bài giảng một-trang-dài bằng workspace theo bước (stepper bấm được), thêm toast, nút có trạng thái chờ, thanh trạng thái job và chuông thông báo.

**Architecture:** Server component đọc workflow một lần (`React.cache`) và suy ra trạng thái 6 bước bằng hàm thuần. Client chỉ giữ ba thứ: `ActivityProvider` (polling endpoint đọc, chỉ `router.refresh()` khi run đổi trạng thái), `useActionFeedback` (bọc server action sẵn có để bắn toast và làm mới), và stepper/chuông. Không đổi schema, server action hay hợp đồng dữ liệu.

**Tech Stack:** Next.js 15.5.28 (App Router), React 19.1.0, Tailwind 4, shadcn `radix-nova` (CLI 4.22.1), `sonner` 2.0.8, `next-themes` 0.4.6, Drizzle 0.45.4, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-10-24-ui-workspace-design.md`

## Global Constraints

- Không đổi schema, migration, `src/lib/algorithm/contracts.ts`, `src/app/algorithm/actions.ts`, worker, Remotion.
- Không viết, không sửa, không chạy file `*.test.*`/`*.spec.*` (AGENTS.md 4-6).
- Mọi thông tin thư viện phải đối chiếu nguồn chính thống trước khi code (AGENTS.md 1); khi API khác plan, **tin tài liệu và file shadcn sinh ra**, rồi ghi lại điều đã đổi.
- Chữ giao diện bằng tiếng Việt, theo giọng hiện có.
- Commit: Conventional Commits, `git add` từng file tường minh (không `-A`, `.`, `-a`), xem `git status` và `git diff --staged` trước khi commit, giữ dòng `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` ở cuối.
- Code dùng chung app+worker không import `server-only`; file mới ở đây chỉ chạy trong app nên không cần.
- File `"use server"` không được `export type ... from` (Turbopack). Trang dùng DB phải có `export const dynamic = "force-dynamic"`.
- React 19 gọi `form.reset()` sau mỗi action: giữ nguyên input ẩn hiện có.
- Cổng 3000 của máy dev có thể bị ứng dụng khác chiếm: kiểm tra trước khi `npm run dev`.

## Điều kiện tiên quyết (kiểm tra trước Task 1)

Cây làm việc hiện có nhiều thay đổi **chưa commit** của nhánh bài giảng (vd. `src/components/app-sidebar.tsx`, `src/app/designs/[id]/layout.tsx`, `src/app/designs/[id]/page.tsx`, `package.json`, và toàn bộ `src/components/algorithm/`, `src/app/algorithm/`, `src/lib/algorithm/`). Plan này sửa nhiều file trong số đó. Nếu commit khi chúng còn dở, commit của plan sẽ **lẫn** công việc ngoài scope (vi phạm AGENTS.md 7).

- [ ] **Bước 0.1:** Chạy `git status --short` và xác nhận user đã commit (hoặc đã quyết định cách xử lý) các thay đổi nhánh bài giảng. Nếu chưa, **dừng và hỏi user**; không tự commit hộ, không dùng `git stash`/`git add -A`.
- [ ] **Bước 0.2:** Chạy `npm run lint && npx tsc --noEmit` làm mốc. Ghi lại lỗi có sẵn (nếu có) để phân biệt với lỗi do plan gây ra.

## File Structure

| File | Trách nhiệm |
|---|---|
| `src/components/ui/{sonner,sheet,tooltip,badge,skeleton}.tsx` | Sinh bằng shadcn CLI |
| `src/app/globals.css` | Token `success/warning/info`, keyframes `indeterminate` |
| `src/components/providers.tsx` | ThemeProvider, TooltipProvider, Toaster |
| `src/lib/ui/status.ts` | Từ vựng trạng thái dùng chung (`UiStatus`, nhãn, tone) |
| `src/components/status-badge.tsx` | Huy hiệu trạng thái |
| `src/hooks/use-action-feedback.ts` | Bọc server action: toast + `router.refresh()` |
| `src/components/action-button.tsx` | Nút có trạng thái chờ |
| `src/lib/algorithm/activity-types.ts` | Kiểu và hàm thuần (an toàn cho client) |
| `src/lib/algorithm/activity.ts` | Truy vấn đọc hoạt động (chỉ server) |
| `src/app/api/designs/[id]/activity/route.ts`, `src/app/api/activity/route.ts` | Endpoint chỉ đọc |
| `src/components/algorithm/activity-provider.tsx` | Polling thích ứng, ngữ cảnh |
| `src/components/algorithm/job-status-bar.tsx` | Thanh trạng thái job |
| `src/lib/algorithm/steps.ts` | `STEPS`, `deriveStepStates`, `pickCurrentStep` |
| `src/lib/algorithm/workflow-cache.ts` | `loadWorkflow` (cache theo request), kiểu `AlgorithmData` |
| `src/lib/algorithm/view.ts` | `problemText` dùng chung |
| `src/app/designs/[id]/algorithm/{layout,page}.tsx`, `[step]/page.tsx`, `[step]/loading.tsx` | Khung, chuyển hướng, trang bước |
| `src/components/algorithm/{stepper,step-header,locked-step,history-sheet,revision-history,solution-summary}.tsx` | Thành phần khung bước |
| `src/components/algorithm/steps/{problem,solution,combo,script,animation,render}-step.tsx` | Nội dung từng bước (server) |
| `src/components/algorithm/render-panel.tsx` | Phần render và duyệt video (tách khỏi `animation-stage.tsx`) |
| `src/components/{app-sidebar,app-topbar,notification-bell}.tsx` | Khung chung |

## Ghi chú lệch spec (đã chốt khi đọc code)

- Stepper có **6 bước** (không có `assets`): workflow không đi qua stage đó (spec đã sửa, commit `80d0a8b`).
- Chỉ cài `sonner sheet tooltip badge skeleton`. `tabs`, `progress`, `separator` trong spec §3 chưa có chỗ dùng (stepper tự dựng, thanh job tự dựng indeterminate) nên bỏ theo YAGNI.
- Breadcrumb giữ ở `designs/[id]/layout.tsx` (đã có); thanh đầu trang chỉ chứa chuông và nút đổi giao diện sáng/tối, tránh hai breadcrumb.

---

### Task 1: Primitive shadcn và token trạng thái

**Files:**
- Create (CLI): `src/components/ui/sonner.tsx`, `sheet.tsx`, `tooltip.tsx`, `badge.tsx`, `skeleton.tsx`
- Modify: `package.json`, `package-lock.json` (CLI), `src/app/globals.css`

**Interfaces:**
- Produces: `Toaster` (`@/components/ui/sonner`); `Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription` (`@/components/ui/sheet`); `Tooltip, TooltipTrigger, TooltipContent, TooltipProvider` (`@/components/ui/tooltip`); `Badge`; `Skeleton`; token màu Tailwind `text-success|warning|info`, `bg-success/10`…

- [ ] **Step 1: Cài component**

```bash
npx shadcn@latest add sonner sheet tooltip badge skeleton
```

Nếu CLI hỏi ghi đè `button.tsx`, chọn **không** (dry-run trước đó báo identical/skip).

- [ ] **Step 2: Đọc file sinh ra và xác nhận API**

Đọc `src/components/ui/sheet.tsx` và `tooltip.tsx`. Ghi lại: tên export thực tế, và `Tooltip` có tự bọc `TooltipProvider` hay không (nếu có thì `TooltipProvider` ở Task 2 vẫn dùng được). Nếu tên export khác plan, dùng tên thực tế ở các task sau.

- [ ] **Step 3: Xác nhận phiên bản không bị đổi ngoài ý muốn**

```bash
git diff package.json
```

Expected: chỉ thêm `sonner` và `next-themes` (và `cn` nếu chưa có). `next`, `react`, `react-dom`, `remotion`, `@remotion/*` không đổi.

- [ ] **Step 4: Thêm token màu và keyframes**

Trong `src/app/globals.css`, trong khối `@theme inline` thêm (sau `--color-destructive`):

```css
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
```

Trong `:root` thêm:

```css
  --success: oklch(0.527 0.154 150);
  --warning: oklch(0.555 0.163 49);
  --info: oklch(0.546 0.245 262.9);
```

Trong `.dark` thêm:

```css
  --success: oklch(0.792 0.209 151.7);
  --warning: oklch(0.828 0.189 84.4);
  --info: oklch(0.707 0.165 254.6);
```

Cuối file thêm:

```css
@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}
```

Lý do: `script-stage.tsx` đã dùng `text-warning`/`text-success` nhưng token chưa tồn tại (class không có tác dụng).

- [ ] **Step 5: Xác minh**

```bash
npm run lint && npx tsc --noEmit
```

Expected: không lỗi mới so với mốc ở Bước 0.2.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/components/ui/sonner.tsx src/components/ui/sheet.tsx src/components/ui/tooltip.tsx src/components/ui/badge.tsx src/components/ui/skeleton.tsx src/app/globals.css
git commit -m "build(ui): add shadcn primitives and status color tokens"
```

---

### Task 2: Providers ở root layout

**Files:**
- Create: `src/components/providers.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `<Providers>` bọc toàn app; `toast` từ `sonner` dùng được ở mọi client component.

- [ ] **Step 1: Tạo `src/components/providers.tsx`**

```tsx
"use client";

import { ThemeProvider } from "next-themes";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {children}
        <Toaster richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 2: Sửa `src/app/layout.tsx`**

Thêm import `import { Providers } from "@/components/providers";`. Đổi `<html lang="vi">` thành `<html lang="vi" suppressHydrationWarning>` (next-themes đặt class `dark` trên `<html>` trước hydrate). Bọc nội dung `<body>`:

```tsx
<body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
  <Providers>
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  </Providers>
</body>
```

- [ ] **Step 3: Xác minh trên trình duyệt**

`npm run lint && npx tsc --noEmit`, rồi `npm run dev`, mở `http://127.0.0.1:3000/`. Expected: trang tải bình thường, không cảnh báo hydration trong console; đặt HĐH sang chế độ tối thì giao diện chuyển tối.

- [ ] **Step 4: Commit**

```bash
git add src/components/providers.tsx src/app/layout.tsx
git commit -m "feat(ui): mount theme, tooltip and toast providers"
```

---

### Task 3: Từ vựng trạng thái và StatusBadge

**Files:**
- Create: `src/lib/ui/status.ts`, `src/components/status-badge.tsx`

**Interfaces:**
- Produces:
  - `type UiStatus = "locked" | "todo" | "running" | "review" | "done" | "failed" | "stale"`
  - `STATUS_META: Record<UiStatus, { label: string; tone: Tone }>`, `type Tone = "muted" | "info" | "warning" | "success" | "destructive"`
  - `<StatusBadge status={UiStatus} className? />`

- [ ] **Step 1: Tạo `src/lib/ui/status.ts`**

```ts
export type UiStatus = "locked" | "todo" | "running" | "review" | "done" | "failed" | "stale";
export type Tone = "muted" | "info" | "warning" | "success" | "destructive";

export const STATUS_META: Record<UiStatus, { label: string; tone: Tone }> = {
  locked: { label: "Chưa mở", tone: "muted" },
  todo: { label: "Cần làm", tone: "muted" },
  running: { label: "Đang xử lý", tone: "info" },
  review: { label: "Chờ duyệt", tone: "warning" },
  done: { label: "Đã duyệt", tone: "success" },
  failed: { label: "Lỗi", tone: "destructive" },
  stale: { label: "Đã cũ", tone: "warning" },
};

export const TONE_CLASS: Record<Tone, string> = {
  muted: "border-border text-muted-foreground",
  info: "border-info/30 bg-info/10 text-info",
  warning: "border-warning/30 bg-warning/10 text-warning",
  success: "border-success/30 bg-success/10 text-success",
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
};
```

- [ ] **Step 2: Tạo `src/components/status-badge.tsx`**

```tsx
import { CircleCheckIcon, CircleDashedIcon, EyeIcon, HistoryIcon, Loader2Icon, LockIcon, OctagonXIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { STATUS_META, TONE_CLASS, type UiStatus } from "@/lib/ui/status";
import { cn } from "@/lib/utils";

const ICONS = {
  locked: LockIcon,
  todo: CircleDashedIcon,
  running: Loader2Icon,
  review: EyeIcon,
  done: CircleCheckIcon,
  failed: OctagonXIcon,
  stale: HistoryIcon,
} as const;

export function StatusBadge({ status, className }: { status: UiStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = ICONS[status];
  return (
    <Badge variant="outline" className={cn("gap-1", TONE_CLASS[meta.tone], className)}>
      <Icon className={cn("size-3", status === "running" && "animate-spin")} />
      {meta.label}
    </Badge>
  );
}
```

- [ ] **Step 3: Xác minh và commit**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/ui/status.ts src/components/status-badge.tsx
git commit -m "feat(ui): add shared status vocabulary and badge"
```

Expected: không lỗi. Nếu `Badge` sinh ra không nhận `variant="outline"`, đọc `badge.tsx` và dùng variant có thật.

---

### Task 4: Phản hồi hành động (`useActionFeedback`, `ActionButton`)

**Files:**
- Create: `src/hooks/use-action-feedback.ts`, `src/components/action-button.tsx`

**Interfaces:**
- Consumes: `FormState` (`@/lib/form`), `toast` (`sonner`).
- Produces:
  - `useActionFeedback(action: (prev: FormState, form: FormData) => Promise<FormState>, options: { success: string; description?: string; refresh?: boolean }): [FormState, (payload: FormData) => void, boolean]`
  - `<ActionButton pending? pendingLabel? ...ButtonProps>`

- [ ] **Step 1: Kiểm tra API sonner**

Mở tài liệu chính thức (https://sonner.emilkowal.ski/toast) và xác nhận `toast.success(message, { description })` và `toast.error(message)` còn đúng ở `sonner` 2.0.x. Nếu khác, sửa đoạn code dưới đây theo tài liệu.

- [ ] **Step 2: Tạo `src/hooks/use-action-feedback.ts`**

```ts
"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback } from "react";
import { toast } from "sonner";

import type { FormState } from "@/lib/form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
type Options = { success: string; description?: string; refresh?: boolean };

// Bọc server action sẵn có: bắn toast ngay khi có kết quả (kể cả khi component bị gỡ sau đó) và làm mới dữ liệu
// máy chủ, vì hầu hết action không gọi revalidatePath. Không dùng cho action kết thúc bằng redirect().
export function useActionFeedback(action: Action, { success, description, refresh = true }: Options) {
  const router = useRouter();
  const wrapped = useCallback<Action>(
    async (prev, form) => {
      const result = await action(prev, form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(success, description ? { description } : undefined);
        if (refresh) router.refresh();
      }
      return result;
    },
    [action, success, description, refresh, router],
  );
  return useActionState<FormState, FormData>(wrapped, {});
}
```

- [ ] **Step 3: Tạo `src/components/action-button.tsx`**

```tsx
"use client";

import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = React.ComponentProps<typeof Button> & { pending?: boolean; pendingLabel?: string };

export function ActionButton({ pending = false, pendingLabel = "Đang gửi…", disabled, children, ...props }: Props) {
  return (
    <Button {...props} disabled={disabled || pending} aria-busy={pending}>
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" data-icon="inline-start" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
```

- [ ] **Step 4: Xác minh và commit**

```bash
npm run lint && npx tsc --noEmit
git add src/hooks/use-action-feedback.ts src/components/action-button.tsx
git commit -m "feat(ui): add action feedback hook and pending button"
```

---

### Task 5: Dữ liệu hoạt động và hai endpoint đọc

**Files:**
- Create: `src/lib/algorithm/activity-types.ts`, `src/lib/algorithm/activity.ts`, `src/app/api/designs/[id]/activity/route.ts`, `src/app/api/activity/route.ts`

**Interfaces:**
- Produces (`activity-types.ts`, an toàn cho client, **không import DB**):

```ts
export type RunStatus = "queued" | "running" | "waiting_review" | "succeeded" | "failed" | "stale";
export type RunActivity = { id: string; stage: string; status: RunStatus; attempts: number; startedAt: string | null; updatedAt: string; error: string | null };
export type DesignActivity = {
  serverTime: string;
  runs: RunActivity[]; // mới nhất trước
  output: { id: string; status: string; updatedAt: string; error: string | null } | null;
  assetRequests: { id: string; status: string }[];
  active: boolean;
};
export type ActivityEvent = { id: string; designId: string; title: string; stage: string; kind: "running" | "ready" | "failed"; at: string };
export const MAX_JOB_ATTEMPTS = 3;
export function isDesignActive(a: Omit<DesignActivity, "active">): boolean;
export function activitySignature(a: DesignActivity): string;
```

- Produces (`activity.ts`, chỉ server): `getDesignActivity(videoId: string): Promise<DesignActivity>`, `getRecentActivity(hours?: number): Promise<ActivityEvent[]>`.

- [ ] **Step 1: Tạo `src/lib/algorithm/activity-types.ts`**

```ts
export type RunStatus = "queued" | "running" | "waiting_review" | "succeeded" | "failed" | "stale";

export type RunActivity = {
  id: string;
  stage: string;
  status: RunStatus;
  attempts: number;
  startedAt: string | null;
  updatedAt: string;
  error: string | null;
};

export type DesignActivity = {
  serverTime: string;
  runs: RunActivity[];
  output: { id: string; status: string; updatedAt: string; error: string | null } | null;
  assetRequests: { id: string; status: string }[];
  active: boolean;
};

export type ActivityEvent = {
  id: string;
  designId: string;
  title: string;
  stage: string;
  kind: "running" | "ready" | "failed";
  at: string;
};

// Runner đánh dấu failed ở lần thử thứ 3 (CLAUDE.md, mục Job).
export const MAX_JOB_ATTEMPTS = 3;

export function isDesignActive(a: Omit<DesignActivity, "active">): boolean {
  return (
    a.runs.some((run) => run.status === "queued" || run.status === "running") ||
    a.output?.status === "generating" ||
    a.assetRequests.some((request) => request.status === "generating")
  );
}

// Chữ ký thay đổi khi một run/output/asset chuyển trạng thái; dùng để quyết định có router.refresh() hay không.
export function activitySignature(a: DesignActivity): string {
  return JSON.stringify([
    a.runs.map((run) => [run.id, run.status, run.attempts]),
    a.output ? [a.output.id, a.output.status] : null,
    a.assetRequests.map((request) => [request.id, request.status]),
  ]);
}
```

- [ ] **Step 2: Tạo `src/lib/algorithm/activity.ts`**

```ts
import { desc, eq, gte } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { algorithmAssetRequests, algorithmGenerationRuns, algorithmOutputs, jobRuns, videos } from "@/lib/db/schema";
import { isDesignActive, type ActivityEvent, type DesignActivity, type RunActivity } from "@/lib/algorithm/activity-types";

export async function getDesignActivity(videoId: string): Promise<DesignActivity> {
  const db = getDb();
  const rows = await db
    .select({
      id: algorithmGenerationRuns.id,
      stage: algorithmGenerationRuns.stage,
      status: algorithmGenerationRuns.status,
      updatedAt: algorithmGenerationRuns.updatedAt,
      runError: algorithmGenerationRuns.error,
      attempts: jobRuns.attempts,
      startedAt: jobRuns.startedAt,
      jobError: jobRuns.error,
    })
    .from(algorithmGenerationRuns)
    .leftJoin(jobRuns, eq(algorithmGenerationRuns.jobRunId, jobRuns.id))
    .where(eq(algorithmGenerationRuns.videoId, videoId))
    .orderBy(desc(algorithmGenerationRuns.createdAt))
    .limit(20);
  const runs: RunActivity[] = rows.map((row) => ({
    id: row.id,
    stage: row.stage,
    status: row.status,
    attempts: row.attempts ?? 0,
    startedAt: row.startedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
    error: row.runError ?? row.jobError ?? null,
  }));
  const [output] = await db
    .select({ id: algorithmOutputs.id, status: algorithmOutputs.status, updatedAt: algorithmOutputs.updatedAt, error: algorithmOutputs.error })
    .from(algorithmOutputs)
    .where(eq(algorithmOutputs.videoId, videoId))
    .orderBy(desc(algorithmOutputs.createdAt))
    .limit(1);
  const assetRequests = await db
    .select({ id: algorithmAssetRequests.id, status: algorithmAssetRequests.status })
    .from(algorithmAssetRequests)
    .where(eq(algorithmAssetRequests.videoId, videoId));
  const base = {
    serverTime: new Date().toISOString(),
    runs,
    output: output ? { id: output.id, status: output.status, updatedAt: output.updatedAt.toISOString(), error: output.error } : null,
    assetRequests,
  };
  return { ...base, active: isDesignActive(base) };
}

export async function getRecentActivity(hours = 24): Promise<ActivityEvent[]> {
  const db = getDb();
  const since = new Date(Date.now() - hours * 3_600_000);
  const runRows = await db
    .select({ id: algorithmGenerationRuns.id, designId: algorithmGenerationRuns.videoId, title: videos.title, stage: algorithmGenerationRuns.stage, status: algorithmGenerationRuns.status, at: algorithmGenerationRuns.updatedAt })
    .from(algorithmGenerationRuns)
    .innerJoin(videos, eq(videos.id, algorithmGenerationRuns.videoId))
    .where(gte(algorithmGenerationRuns.updatedAt, since))
    .orderBy(desc(algorithmGenerationRuns.updatedAt))
    .limit(50);
  const outputRows = await db
    .select({ id: algorithmOutputs.id, designId: algorithmOutputs.videoId, title: videos.title, status: algorithmOutputs.status, at: algorithmOutputs.updatedAt })
    .from(algorithmOutputs)
    .innerJoin(videos, eq(videos.id, algorithmOutputs.videoId))
    .where(gte(algorithmOutputs.updatedAt, since))
    .orderBy(desc(algorithmOutputs.updatedAt))
    .limit(20);
  const events: ActivityEvent[] = [];
  for (const row of runRows) {
    const kind = row.status === "queued" || row.status === "running" ? "running" : row.status === "failed" ? "failed" : row.status === "stale" ? null : "ready";
    if (kind) events.push({ id: row.id, designId: row.designId, title: row.title, stage: row.stage, kind, at: row.at.toISOString() });
  }
  for (const row of outputRows) {
    const kind = row.status === "generating" ? "running" : row.status === "failed" ? "failed" : row.status === "pending_review" ? "ready" : null;
    if (kind) events.push({ id: row.id, designId: row.designId, title: row.title, stage: "render", kind, at: row.at.toISOString() });
  }
  return events.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
}
```

- [ ] **Step 3: Tạo `src/app/api/designs/[id]/activity/route.ts`**

```ts
import { NextResponse } from "next/server";

import { getDesignActivity } from "@/lib/algorithm/activity";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
  try {
    return NextResponse.json(await getDesignActivity(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Tạo `src/app/api/activity/route.ts`**

```ts
import { NextResponse } from "next/server";

import { getRecentActivity } from "@/lib/algorithm/activity";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ events: await getRecentActivity(24) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
```

- [ ] **Step 5: Xác minh**

```bash
npm run lint && npx tsc --noEmit
```

Rồi `npm run dev` và gọi `curl http://127.0.0.1:3000/api/activity` (JSON có `events`) và `curl http://127.0.0.1:3000/api/designs/<id-design-bài-giảng-có-sẵn>/activity` (JSON có `runs`, `output`, `assetRequests`, `active`). Ghi lại phản hồi thật vào báo cáo. Nếu cột `jobRuns.attempts` hoặc join lỗi, đọc lại `schema.ts` rồi sửa truy vấn.

- [ ] **Step 6: Commit**

```bash
git add src/lib/algorithm/activity-types.ts src/lib/algorithm/activity.ts src/app/api/designs/[id]/activity/route.ts src/app/api/activity/route.ts
git commit -m "feat(api): add read-only activity endpoints for algorithm jobs"
```

---

### Task 6: ActivityProvider và JobStatusBar

**Files:**
- Create: `src/components/algorithm/activity-provider.tsx`, `src/components/algorithm/job-status-bar.tsx`

**Interfaces:**
- Consumes: `DesignActivity`, `activitySignature`, `MAX_JOB_ATTEMPTS` (Task 5).
- Produces: `<ActivityProvider videoId children>`, `useActivity(): { activity: DesignActivity | null; offline: boolean; skewMs: number }`, `<JobStatusBar stages={string[]} assets? />`.

- [ ] **Step 1: Tạo `activity-provider.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";

import { activitySignature, type DesignActivity } from "@/lib/algorithm/activity-types";

type ActivityContextValue = { activity: DesignActivity | null; offline: boolean; skewMs: number };

const ActivityContext = createContext<ActivityContextValue>({ activity: null, offline: false, skewMs: 0 });
export const useActivity = () => useContext(ActivityContext);

const FAST_MS = 2_000;
const IDLE_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

// Polling thích ứng: nhanh khi có job chạy, chậm khi rảnh, dừng khi tab ẩn. Chỉ gọi router.refresh()
// khi một run/output/asset đổi trạng thái (không làm mới cả trang mỗi vài giây như AutoRefresh).
export function ActivityProvider({ videoId, children }: { videoId: string; children: React.ReactNode }) {
  const router = useRouter();
  const [value, setValue] = useState<ActivityContextValue>({ activity: null, offline: false, skewMs: 0 });
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    const tick = async () => {
      if (stopped) return;
      let delay = IDLE_MS;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch(`/api/designs/${videoId}/activity`, { cache: "no-store" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = (await response.json()) as DesignActivity;
          if (stopped) return;
          failures = 0;
          setValue({ activity: data, offline: false, skewMs: Date.parse(data.serverTime) - Date.now() });
          const signature = activitySignature(data);
          if (lastSignature.current !== null && lastSignature.current !== signature) router.refresh();
          lastSignature.current = signature;
          delay = data.active ? FAST_MS : IDLE_MS;
        } catch {
          failures += 1;
          setValue((previous) => ({ ...previous, offline: true }));
          delay = Math.min(FAST_MS * 2 ** failures, MAX_BACKOFF_MS);
        }
      }
      if (!stopped) timer = setTimeout(tick, delay);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [videoId, router]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
```

- [ ] **Step 2: Tạo `job-status-bar.tsx`**

```tsx
"use client";

import { Loader2Icon, OctagonXIcon, WifiOffIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { useActivity } from "@/components/algorithm/activity-provider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_JOB_ATTEMPTS } from "@/lib/algorithm/activity-types";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1_000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

// stages: stage của algorithm_generation_runs cần theo dõi; assets: theo dõi cả việc sinh ảnh asset.
export function JobStatusBar({ stages, assets = false }: { stages: string[]; assets?: boolean }) {
  const { activity, offline, skewMs } = useActivity();
  const run = activity?.runs.find((item) => stages.includes(item.stage));
  const assetsRunning = assets && Boolean(activity?.assetRequests.some((request) => request.status === "generating"));
  const running = run?.status === "queued" || run?.status === "running";
  const now = useNow(running);

  if (!activity) return null;

  if (running && run) {
    const since = Date.parse(run.startedAt ?? run.updatedAt);
    const elapsed = now + skewMs - since;
    const label =
      run.status === "queued"
        ? `Đang xếp hàng chờ worker · ${clock(elapsed)}`
        : `Đang chạy · ${clock(elapsed)}${run.attempts > 1 ? ` · thử lại lần ${run.attempts}/${MAX_JOB_ATTEMPTS}` : ""}`;
    return (
      <div role="status" className="flex flex-col gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
        <div className="flex items-center gap-2">
          <Loader2Icon className="size-4 animate-spin" />
          <span>{label}</span>
          {offline && <WifiOffIcon className="ml-auto size-4" aria-label="Mất kết nối, đang thử lại" />}
        </div>
        <div className="h-1 overflow-hidden rounded bg-info/20">
          <div className="h-full w-1/3 animate-[indeterminate_1.2s_ease-in-out_infinite] rounded bg-info" />
        </div>
      </div>
    );
  }

  if (assetsRunning) {
    return (
      <div role="status" className="flex items-center gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-info">
        <Loader2Icon className="size-4 animate-spin" />
        <span>Worker đang tạo ảnh asset…</span>
      </div>
    );
  }

  if (run?.status === "failed") {
    const message = run.error ?? "Job lỗi, chưa có chi tiết";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="alert" tabIndex={0} className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <OctagonXIcon className="size-4 shrink-0" />
            <span className="truncate">Job lỗi: {message}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm break-words">{message}</TooltipContent>
      </Tooltip>
    );
  }

  return offline ? (
    <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <WifiOffIcon className="size-3.5" /> Mất kết nối tới máy chủ, đang thử lại…
    </div>
  ) : null;
}
```

Nếu `TooltipTrigger` sinh ra không hỗ trợ `asChild`, đọc `tooltip.tsx` và dùng prop tương đương.

- [ ] **Step 3: Xác minh và commit**

```bash
npm run lint && npx tsc --noEmit
git add src/components/algorithm/activity-provider.tsx src/components/algorithm/job-status-bar.tsx
git commit -m "feat(ui): add adaptive activity polling and job status bar"
```

---

### Task 7: Trạng thái bước (`steps.ts`) và cache workflow

**Files:**
- Create: `src/lib/algorithm/steps.ts`, `src/lib/algorithm/workflow-cache.ts`, `src/lib/algorithm/view.ts`

**Interfaces:**
- Produces:
  - `type StepKey = "problem" | "solution" | "combo" | "script" | "animation" | "render"`
  - `STEPS: readonly { key: StepKey; label: string; requires: StepKey | null }[]`
  - `type StepState = { key: StepKey; label: string; status: UiStatus; lockedReason?: string }`
  - `isStepKey(value: string): value is StepKey`
  - `deriveStepStates(data: AlgorithmData): StepState[]`
  - `pickCurrentStep(states: StepState[]): StepKey`
  - `NEXT_ACTION: Record<UiStatus, (label: string) => string>`
  - `loadWorkflow(videoId: string)` (cache theo request), `type AlgorithmData`
  - `problemText(revision): string`

- [ ] **Step 1: Tạo `workflow-cache.ts`**

```ts
import { cache } from "react";

import { getAlgorithmWorkflow } from "@/lib/algorithm/queries";

// Layout và page của cùng một request dùng chung kết quả, không truy vấn hai lần.
export const loadWorkflow = cache(getAlgorithmWorkflow);
export type AlgorithmData = NonNullable<Awaited<ReturnType<typeof getAlgorithmWorkflow>>>;
```

- [ ] **Step 2: Tạo `view.ts`**

```ts
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function problemText(revision: AlgorithmData["revisions"][number] | undefined): string {
  const parsed = revision?.content as { text?: unknown } | undefined;
  return typeof parsed?.text === "string" ? parsed.text : "";
}
```

- [ ] **Step 3: Tạo `steps.ts`**

```ts
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";
import type { UiStatus } from "@/lib/ui/status";

export type StepKey = "problem" | "solution" | "combo" | "script" | "animation" | "render";

// Workflow không đi qua stage "assets": asset được gắn ngay trong bước kịch bản (pipeline.ts).
export const STEPS: readonly { key: StepKey; label: string; requires: StepKey | null }[] = [
  { key: "problem", label: "Đề bài", requires: null },
  { key: "solution", label: "Lời giải", requires: "problem" },
  { key: "combo", label: "Combo", requires: "solution" },
  { key: "script", label: "Kịch bản", requires: "combo" },
  { key: "animation", label: "Animation", requires: "script" },
  { key: "render", label: "Video", requires: "animation" },
];

export type StepState = { key: StepKey; label: string; status: UiStatus; lockedReason?: string };

export const isStepKey = (value: string): value is StepKey => STEPS.some((step) => step.key === value);

const POINTERS = {
  problem: { active: "activeProblemId", accepted: "acceptedProblemId" },
  solution: { active: "activeSolutionId", accepted: "acceptedSolutionId" },
  combo: { active: "activeComboId", accepted: "acceptedComboId" },
  script: { active: "activeScriptId", accepted: "acceptedScriptId" },
  animation: { active: "activeAnimationId", accepted: "acceptedAnimationId" },
} as const;

type Revision = AlgorithmData["revisions"][number];
type Run = AlgorithmData["generationRuns"][number];

function revisionStatus(revision: Revision | undefined, run: Run | undefined): UiStatus {
  if (!revision) return "todo";
  if (revision.status === "approved") return "done";
  if (revision.status === "generating" || run?.status === "queued" || run?.status === "running") return "running";
  if (revision.status === "pending_review") return "review";
  if (revision.status === "failed") return "failed";
  if (revision.status === "stale") return "stale";
  return "todo"; // draft, rejected
}

function ownStatus(key: StepKey, data: AlgorithmData): UiStatus {
  const { workflow, revisions, generationRuns, outputs, assetRequests } = data;
  if (key === "render") {
    const output = outputs.find((item) => item.id === workflow.activeOutputId);
    if (!output) return "todo";
    if (output.status === "generating") return "running";
    if (output.status === "pending_review") return "review";
    if (output.status === "approved") return "done";
    if (output.status === "failed") return "failed";
    if (output.status === "stale") return "stale";
    return "todo";
  }
  const revision = revisions.find((item) => item.id === workflow[POINTERS[key].active]);
  const run = revision?.generationRunId ? generationRuns.find((item) => item.id === revision.generationRunId) : undefined;
  const status = revisionStatus(revision, run);
  if (key === "script" && revision && status !== "done" && assetRequests.some((request) => request.scriptRevisionId === revision.id && request.status === "generating")) return "running";
  return status;
}

export function deriveStepStates(data: AlgorithmData): StepState[] {
  const { workflow } = data;
  const acceptedPointer: Record<StepKey, string | null> = {
    problem: workflow.acceptedProblemId,
    solution: workflow.acceptedSolutionId,
    combo: workflow.acceptedComboId,
    script: workflow.acceptedScriptId,
    animation: workflow.acceptedAnimationId,
    render: workflow.acceptedOutputId,
  };
  return STEPS.map((step) => {
    const own = ownStatus(step.key, data);
    if (step.requires && !acceptedPointer[step.requires]) {
      const previous = STEPS.find((item) => item.key === step.requires)!;
      // Có revision riêng nhưng đầu vào không còn được duyệt: bản cũ, không phải "đã duyệt".
      if (own === "done") return { key: step.key, label: step.label, status: "stale" as const };
      if (own !== "todo") return { key: step.key, label: step.label, status: own };
      return { key: step.key, label: step.label, status: "locked" as const, lockedReason: `Cần duyệt "${previous.label}" trước` };
    }
    return { key: step.key, label: step.label, status: own };
  });
}

// Bước đầu tiên đã mở mà chưa xong; nếu tất cả xong thì bước cuối.
export function pickCurrentStep(states: StepState[]): StepKey {
  return states.find((state) => state.status !== "locked" && state.status !== "done")?.key ?? "render";
}

export const NEXT_ACTION: Record<UiStatus, (label: string) => string> = {
  locked: (label) => `Chưa thể làm "${label}".`,
  todo: (label) => `Việc tiếp theo: bắt đầu bước "${label}".`,
  running: (label) => `Worker đang xử lý "${label}". Trang sẽ tự cập nhật khi xong.`,
  review: (label) => `Việc tiếp theo: xem lại và duyệt "${label}".`,
  done: (label) => `"${label}" đã được duyệt.`,
  failed: (label) => `"${label}" gặp lỗi. Xem thông báo lỗi bên dưới rồi thử lại hoặc chỉnh đầu vào.`,
  stale: (label) => `"${label}" đã cũ vì bước trước thay đổi. Tạo lại bản mới.`,
};
```

Ghi chú xác minh: `data.generationRuns[].status`, `outputs[].status`, `assetRequests[].scriptRevisionId` đều có trong `getAlgorithmWorkflow` (`queries.ts`). `outputs[].status` dùng enum `review_status` nên có `generating`, `pending_review`, `approved`, `failed`, `stale`.

- [ ] **Step 4: Xác minh và commit**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/algorithm/steps.ts src/lib/algorithm/workflow-cache.ts src/lib/algorithm/view.ts
git commit -m "feat(algorithm): derive workspace step states from workflow data"
```

Expected: `tsc` không lỗi. Nếu kiểu của `workflow[POINTERS[key].active]` bị phàn nàn, ép bằng `as string | null`.

---

### Task 8: Khung workspace (layout, stepper, lịch sử, chuyển hướng, trang bước, khóa)

**Files:**
- Create: `src/app/designs/[id]/algorithm/layout.tsx`, `src/app/designs/[id]/algorithm/[step]/page.tsx`, `src/app/designs/[id]/algorithm/[step]/loading.tsx`, `src/components/algorithm/{stepper,step-header,locked-step,history-sheet,revision-history}.tsx`
- Modify: `src/app/designs/[id]/algorithm/page.tsx` (thay toàn bộ bằng chuyển hướng; mã cũ được chuyển sang các task 9-10)

**Interfaces:**
- Consumes: `loadWorkflow`, `deriveStepStates`, `pickCurrentStep`, `isStepKey`, `STEPS`, `NEXT_ACTION`, `ActivityProvider`, `JobStatusBar`, `StatusBadge`.
- Produces: stepper trên mọi route dưới `/designs/[id]/algorithm`; trang bước gọi `renderStep(key, data)` (Task 9-10 điền nội dung; trong task này dùng placeholder tạm có điều kiện, xem Step 6).

> **Quan trọng:** task này làm trang cũ biến mất. Để không để repo ở trạng thái hỏng giữa các commit, **thực hiện Task 8, 9, 10 liên tiếp trong một nhánh làm việc và chỉ commit Task 8 sau khi Step 6 (bản tạm) build qua**.

- [ ] **Step 1: Tạo `locked-step.tsx`**

```tsx
import Link from "next/link";
import { LockIcon } from "lucide-react";

export function LockedStep({ reason, currentHref }: { reason: string; currentHref: string }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 text-sm">
      <div className="flex items-center gap-2 font-medium">
        <LockIcon className="size-4" /> Bước này chưa mở
      </div>
      <p className="text-muted-foreground">{reason}.</p>
      <Link href={currentHref} className="underline">
        Đến bước cần làm
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Tạo `stepper.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StepState } from "@/lib/algorithm/steps";
import { cn } from "@/lib/utils";

export function AlgorithmStepper({ designId, steps }: { designId: string; steps: StepState[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Các bước bài giảng">
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {steps.map((step, index) => {
          const href = `/designs/${designId}/algorithm/${step.key}`;
          const active = pathname === href;
          const body = (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium">{index + 1}</span>
              <span className="flex flex-col items-start gap-1">
                <span className="text-sm font-medium whitespace-nowrap">{step.label}</span>
                <StatusBadge status={step.status} />
              </span>
            </>
          );
          const base = "flex min-w-36 items-center gap-2 rounded-lg border px-3 py-2";
          return (
            <li key={step.key}>
              {step.status === "locked" ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} aria-disabled="true" className={cn(base, "cursor-not-allowed opacity-60")}>
                      {body}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{step.lockedReason}</TooltipContent>
                </Tooltip>
              ) : (
                <Link href={href} aria-current={active ? "step" : undefined} className={cn(base, "hover:bg-muted", active && "border-foreground bg-muted")}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 3: Tạo `step-header.tsx`**

```tsx
import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { JobStatusBar } from "@/components/algorithm/job-status-bar";
import { NEXT_ACTION, STEPS, type StepKey, type StepState } from "@/lib/algorithm/steps";

export function StepHeader({ designId, state, currentKey, jobStages, jobAssets }: { designId: string; state: StepState; currentKey: StepKey; jobStages: string[]; jobAssets?: boolean }) {
  const next = STEPS[STEPS.findIndex((step) => step.key === state.key) + 1];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{state.label}</h2>
        <StatusBadge status={state.status} />
      </div>
      <JobStatusBar stages={jobStages} assets={jobAssets} />
      <p className="text-sm text-muted-foreground">
        {NEXT_ACTION[state.status](state.label)}{" "}
        {state.status === "done" && next && (
          <Link href={`/designs/${designId}/algorithm/${next.key}`} className="underline">
            Đến "{next.label}"
          </Link>
        )}
        {state.key !== currentKey && state.status !== "done" && (
          <Link href={`/designs/${designId}/algorithm/${currentKey}`} className="underline">
            Đến bước cần làm
          </Link>
        )}
      </p>
    </header>
  );
}
```

- [ ] **Step 4: Tạo `revision-history.tsx` và `history-sheet.tsx`**

`revision-history.tsx` (server, chuyển nguyên khối `<details>` của trang cũ):

```tsx
import { problemText } from "@/lib/algorithm/view";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";
import { ALGORITHM_STAGE_LABELS } from "@/lib/video/kind";

export function RevisionHistory({ data }: { data: AlgorithmData }) {
  return (
    <ol className="flex flex-col gap-3 text-sm">
      {data.revisions.map((revision) => {
        const inputs = data.inputs.filter((input) => input.revisionId === revision.id);
        const decisions = data.decisions.filter((decision) => decision.revisionId === revision.id);
        return (
          <li key={revision.id} className="rounded-md bg-muted/40 p-3">
            <div className="font-medium">
              {ALGORITHM_STAGE_LABELS[revision.stage]} · v{revision.version} · {revision.status} · {revision.source}
            </div>
            <div className="text-xs break-all text-muted-foreground">
              {revision.id} · fingerprint {revision.inputFingerprint}
            </div>
            {inputs.length > 0 && <p className="text-xs">Nguồn: {inputs.map((input) => input.inputRevisionId).join(", ")}</p>}
            {decisions.map((decision) => (
              <p key={decision.id} className="mt-1">
                {decision.decision === "approved" ? "Đã duyệt" : "Đã từ chối"}
                {decision.reason ? ` · ${decision.reason}` : ""}
              </p>
            ))}
            {revision.stage === "problem" && <p className="mt-2 whitespace-pre-wrap">{problemText(revision)}</p>}
          </li>
        );
      })}
    </ol>
  );
}
```

`history-sheet.tsx` (client, nhận nội dung server qua `children`):

```tsx
"use client";

import { HistoryIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function HistorySheet({ children }: { children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <HistoryIcon data-icon="inline-start" /> Lịch sử
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Lịch sử revision và quyết định</SheetTitle>
          <SheetDescription>Mọi bản đã tạo, nguồn đầu vào và lý do duyệt hoặc từ chối.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
```

Đối chiếu `sheet.tsx` sinh ra (Task 1 Step 2) và sửa tên/prop nếu khác.

- [ ] **Step 5: Tạo `layout.tsx`**

```tsx
import { notFound } from "next/navigation";

import { ActivityProvider } from "@/components/algorithm/activity-provider";
import { HistorySheet } from "@/components/algorithm/history-sheet";
import { RevisionHistory } from "@/components/algorithm/revision-history";
import { AlgorithmStepper } from "@/components/algorithm/stepper";
import { deriveStepStates } from "@/lib/algorithm/steps";
import { loadWorkflow } from "@/lib/algorithm/workflow-cache";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export default async function AlgorithmLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await loadWorkflow(id);
  if (!data) notFound();
  return (
    <ActivityProvider videoId={id}>
      <div className="flex flex-col gap-6 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <AlgorithmStepper designId={id} steps={deriveStepStates(data)} />
          </div>
          <HistorySheet>
            <RevisionHistory data={data} />
          </HistorySheet>
        </div>
        {children}
      </div>
    </ActivityProvider>
  );
}
```

- [ ] **Step 6: Thay `algorithm/page.tsx` bằng chuyển hướng**

```tsx
import { notFound, redirect } from "next/navigation";

import { deriveStepStates, pickCurrentStep } from "@/lib/algorithm/steps";
import { loadWorkflow } from "@/lib/algorithm/workflow-cache";

export const dynamic = "force-dynamic";

export default async function AlgorithmIndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadWorkflow(id);
  if (!data) notFound();
  redirect(`/designs/${id}/algorithm/${pickCurrentStep(deriveStepStates(data))}`);
}
```

- [ ] **Step 7: Tạo `[step]/loading.tsx`**

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

- [ ] **Step 8: Tạo `[step]/page.tsx` (bản tạm, hoàn thiện ở Task 9-10)**

```tsx
import { notFound } from "next/navigation";

import { LockedStep } from "@/components/algorithm/locked-step";
import { StepHeader } from "@/components/algorithm/step-header";
import { deriveStepStates, isStepKey, pickCurrentStep, type StepKey } from "@/lib/algorithm/steps";
import { loadWorkflow, type AlgorithmData } from "@/lib/algorithm/workflow-cache";

export const dynamic = "force-dynamic";

const JOB_STAGES: Record<StepKey, string[]> = { problem: [], solution: ["solution"], combo: ["combo"], script: ["script"], animation: ["animation"], render: ["render"] };

function renderStep(key: StepKey, data: AlgorithmData) {
  void data;
  return <p className="text-muted-foreground">Nội dung bước "{key}" đang được chuyển sang giao diện mới.</p>;
}

export default async function AlgorithmStepPage({ params }: { params: Promise<{ id: string; step: string }> }) {
  const { id, step } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !isStepKey(step)) notFound();
  const data = await loadWorkflow(id);
  if (!data) notFound();
  const states = deriveStepStates(data);
  const state = states.find((item) => item.key === step)!;
  const currentKey = pickCurrentStep(states);
  if (state.status === "locked") return <LockedStep reason={state.lockedReason ?? "Chưa đủ điều kiện"} currentHref={`/designs/${id}/algorithm/${currentKey}`} />;
  return (
    <section className="flex flex-col gap-4">
      <StepHeader designId={id} state={state} currentKey={currentKey} jobStages={JOB_STAGES[step]} jobAssets={step === "script"} />
      {renderStep(step, data)}
    </section>
  );
}
```

- [ ] **Step 9: Xác minh bản tạm**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Rồi `npm run dev`, mở `/designs/<id-bài-giảng>/algorithm`. Expected: chuyển hướng tới bước hiện hành; stepper hiện 6 bước có huy hiệu; bước khóa có tooltip lý do; nút "Lịch sử" mở ngăn kéo; truy cập trực tiếp URL bước khóa hiện `LockedStep`.

- [ ] **Step 10: Commit**

```bash
git add src/app/designs/[id]/algorithm/layout.tsx src/app/designs/[id]/algorithm/page.tsx src/app/designs/[id]/algorithm/[step]/page.tsx src/app/designs/[id]/algorithm/[step]/loading.tsx src/components/algorithm/stepper.tsx src/components/algorithm/step-header.tsx src/components/algorithm/locked-step.tsx src/components/algorithm/history-sheet.tsx src/components/algorithm/revision-history.tsx
git commit -m "feat(algorithm): add stepper workspace shell with per-step routes"
```

---

### Task 9: Bước Đề bài, Lời giải, Combo

**Files:**
- Create: `src/components/algorithm/steps/problem-step.tsx`, `solution-step.tsx`, `combo-step.tsx`, `src/components/algorithm/solution-summary.tsx`
- Modify: `src/components/algorithm/{problem-editor,generate-solution,solution-editor,revision-review,combo-stage}.tsx`, `src/app/designs/[id]/algorithm/[step]/page.tsx` (`renderStep`)

**Interfaces:**
- Consumes: `useActionFeedback`, `ActionButton`, `AlgorithmData`, `problemText`.
- Produces: `<ProblemStep data>`, `<SolutionStep data>`, `<ComboStep data>`.

- [ ] **Step 1: Quy tắc chuyển đổi form (áp dụng cho mọi component ở Task 9-10)**

Với mỗi cặp `useActionState<FormState, FormData>(ACTION, {})` đổi thành `useActionFeedback(ACTION, { success: "…" })` (giữ nguyên tên biến `[state, action, pending]`), bỏ import `useActionState` và `FormState` nếu không còn dùng, thêm `import { useActionFeedback } from "@/hooks/use-action-feedback";`. Mỗi `<Button …disabled={pending}>Nhãn</Button>` trong form đổi thành `<ActionButton … pending={pending} pendingLabel="…">Nhãn</ActionButton>` (xoá `disabled={pending}` nhưng giữ các điều kiện `disabled` khác). Giữ nguyên input ẩn và dòng `state.error`.

Ví dụ hoàn chỉnh, `problem-editor.tsx` sau khi chuyển:

```tsx
"use client";

import { saveProblem } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { useActionFeedback } from "@/hooks/use-action-feedback";

export function ProblemEditor({ videoId, concurrencyVersion, value = "" }: { videoId: string; concurrencyVersion: number; value?: string }) {
  const [state, action, pending] = useActionFeedback(saveProblem, { success: "Đã lưu revision đề bài" });
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="videoId" value={videoId} />
      <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
      <label className="flex flex-col gap-1">
        Đề bài <span className="text-xs text-muted-foreground">Tối đa 100.000 ký tự</span>
        <textarea name="problem" maxLength={100000} rows={10} defaultValue={value} className="w-full rounded-lg border border-input bg-transparent p-3 text-sm" />
      </label>
      <ActionButton size="sm" pending={pending} pendingLabel="Đang lưu…" className="self-start">Lưu revision đề bài</ActionButton>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
```

- [ ] **Step 2: Chuyển các form còn lại của Task 9 theo bảng**

| File | Action → thông điệp `success` | Nhãn nút / `pendingLabel` |
|---|---|---|
| `generate-solution.tsx` | `generateSolution` → "Đã gửi yêu cầu sinh lời giải" (thêm `description: "Worker đang xử lý, xem thanh tiến trình phía trên"`) | giữ biểu thức nhãn hiện có; `pendingLabel="Đang gửi…"` |
| `solution-editor.tsx` | `saveSolution` → "Đã gửi lời giải thủ công để duyệt" | "Gửi lời giải thủ công để duyệt" / "Đang lưu…" |
| `revision-review.tsx` | `decideRevision` (duyệt) → "Đã duyệt revision"; `decideRevision` (từ chối) → "Đã từ chối revision"; `regenerateSolution` → "Đã gửi yêu cầu LLM sửa lại" | "Duyệt revision" / "Đang duyệt…"; "Từ chối" / "Đang gửi…"; "Từ chối và yêu cầu LLM sửa" / "Đang gửi…" |
| `combo-stage.tsx` | `beginCombo` → "Đã gửi yêu cầu đề xuất combo"; `saveManualCombo` → "Đã lưu combo để duyệt"; `approveStage` → "Đã duyệt combo" | "Đề xuất combo bằng LLM" (giữ biểu thức nhãn) / "Đang gửi…"; "Lưu combo để duyệt" / "Đang lưu…"; "Duyệt combo này" / "Đang duyệt…" |

Riêng `combo-stage.tsx`: đổi `<h2>` của khối ngoài thành `<h3>` hoặc bỏ tiêu đề lặp (tiêu đề bước đã có ở `StepHeader`); giữ phần mô tả. Giữ nguyên props và logic.

- [ ] **Step 3: Tạo `solution-summary.tsx`** (chuyển `SolutionSummary` từ trang cũ, thêm `export`, `"use client"` không cần)

```tsx
type Solution = {
  representation?: string; insight?: string; algorithm?: string; correctness?: string;
  complexity?: { time?: string; memory?: string; explanation?: string };
  code?: string; walkthrough?: string; edgeCases?: string[]; assumptions?: string[];
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
      {solution.walkthrough && <p><strong>Truy vết:</strong> {solution.walkthrough}</p>}
      {!!solution.edgeCases?.length && <p><strong>Ca biên:</strong> {solution.edgeCases.join(" · ")}</p>}
      {!!solution.assumptions?.length && <p><strong>Giả định:</strong> {solution.assumptions.join(" · ")}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Tạo `problem-step.tsx`**

```tsx
import { ProblemEditor } from "@/components/algorithm/problem-editor";
import { RevisionReview } from "@/components/algorithm/revision-review";
import { problemText } from "@/lib/algorithm/view";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function ProblemStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions } = data;
  const problem = revisions.find((revision) => revision.id === workflow.activeProblemId);
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <h3 className="font-medium">Đề bài · v{problem?.version ?? 1} · {problem?.status ?? "draft"}</h3>
      <ProblemEditor videoId={workflow.videoId} concurrencyVersion={workflow.concurrencyVersion} value={problemText(problem)} />
      {problem?.status === "pending_review" && (
        <RevisionReview videoId={workflow.videoId} revisionId={problem.id} fingerprint={problem.inputFingerprint} concurrencyVersion={workflow.concurrencyVersion} source={problem.source} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Tạo `solution-step.tsx`**

```tsx
import { GenerateSolution } from "@/components/algorithm/generate-solution";
import { RevisionReview } from "@/components/algorithm/revision-review";
import { SolutionEditor } from "@/components/algorithm/solution-editor";
import { SolutionSummary } from "@/components/algorithm/solution-summary";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function SolutionStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns } = data;
  const solution = revisions.find((revision) => revision.id === workflow.activeSolutionId);
  const run = solution?.generationRunId ? generationRuns.find((item) => item.id === solution.generationRunId) : undefined;
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      {workflow.acceptedProblemId ? (
        <>
          <GenerateSolution videoId={workflow.videoId} concurrencyVersion={workflow.concurrencyVersion} running={solution?.status === "generating"} blocked={solution?.status === "pending_review"} />
          {solution?.status === "failed" && <p className="text-sm text-destructive">Lần sinh lời giải lỗi; có thể yêu cầu LLM sinh lại.</p>}
          <SolutionEditor videoId={workflow.videoId} concurrencyVersion={workflow.concurrencyVersion} />
        </>
      ) : (
        <p className="text-muted-foreground">Duyệt một revision đề bài trước khi sinh lời giải.</p>
      )}
      {solution && (
        <div className="rounded-md bg-muted/40 p-3">
          <p className="mb-2">Lời giải v{solution.version} · {solution.status}{solution.source === "llm" ? ` · LLM${solution.model ? ` (${solution.model})` : ""}` : " · nhập tay"}</p>
          {solution.status === "generating" ? <p>Đang chờ worker tạo lời giải…</p> : <SolutionSummary content={solution.content} />}
          {run?.error && <p className="mt-2 text-xs text-destructive">{run.error}</p>}
          {solution.status === "pending_review" && (
            <div className="mt-4">
              <RevisionReview videoId={workflow.videoId} revisionId={solution.id} fingerprint={solution.inputFingerprint} concurrencyVersion={workflow.concurrencyVersion} source={solution.source} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Tạo `combo-step.tsx`**

```tsx
import { ComboStage } from "@/components/algorithm/combo-stage";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function ComboStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns } = data;
  const combo = revisions.find((revision) => revision.id === workflow.activeComboId);
  const run = combo?.generationRunId ? generationRuns.find((item) => item.id === combo.generationRunId) : undefined;
  return (
    <>
      <ComboStage
        videoId={workflow.videoId}
        concurrencyVersion={workflow.concurrencyVersion}
        acceptedSolutionId={workflow.acceptedSolutionId}
        activeRevision={combo ? { id: combo.id, status: combo.status, source: combo.source, inputFingerprint: combo.inputFingerprint, content: combo.content } : undefined}
        acceptedComboId={workflow.acceptedComboId}
      />
      {run?.error && <p className="text-xs text-destructive">Lỗi job combo: {run.error}</p>}
    </>
  );
}
```

- [ ] **Step 7: Nối vào `[step]/page.tsx`**

Thay `renderStep` tạm bằng bản có `switch` cho ba bước này (hai bước còn lại vẫn là placeholder đến Task 10):

```tsx
import { ComboStep } from "@/components/algorithm/steps/combo-step";
import { ProblemStep } from "@/components/algorithm/steps/problem-step";
import { SolutionStep } from "@/components/algorithm/steps/solution-step";

function renderStep(key: StepKey, data: AlgorithmData) {
  switch (key) {
    case "problem": return <ProblemStep data={data} />;
    case "solution": return <SolutionStep data={data} />;
    case "combo": return <ComboStep data={data} />;
    default: return <p className="text-muted-foreground">Nội dung bước "{key}" đang được chuyển sang giao diện mới.</p>;
  }
}
```

- [ ] **Step 8: Xác minh**

```bash
npm run lint && npx tsc --noEmit
```

Trình duyệt, trên design bài giảng có sẵn: (a) bước Đề bài: bấm "Lưu revision đề bài" → thấy spinner "Đang lưu…", toast thành công, danh sách revision cập nhật **không cần tải lại tay**; (b) cố ý gửi dữ liệu sai (đề bài trống nếu schema từ chối) → toast lỗi đỏ **và** dòng lỗi cạnh nút; (c) bước Lời giải: bấm "LLM đề xuất lời giải" → toast "Đã gửi yêu cầu…", `JobStatusBar` hiện "Đang xếp hàng/Đang chạy" với đồng hồ, khi worker xong trang tự cập nhật. Cần `docker compose` worker hoặc `npm run worker` đang chạy để thấy (c); nếu không có, ghi rõ chưa kiểm tra.

- [ ] **Step 9: Commit**

```bash
git add src/components/algorithm/steps/problem-step.tsx src/components/algorithm/steps/solution-step.tsx src/components/algorithm/steps/combo-step.tsx src/components/algorithm/solution-summary.tsx src/components/algorithm/problem-editor.tsx src/components/algorithm/generate-solution.tsx src/components/algorithm/solution-editor.tsx src/components/algorithm/revision-review.tsx src/components/algorithm/combo-stage.tsx src/app/designs/[id]/algorithm/[step]/page.tsx
git commit -m "feat(algorithm): move problem, solution and combo into step pages"
```

---

### Task 10: Bước Kịch bản, Animation, Video

**Files:**
- Create: `src/components/algorithm/steps/script-step.tsx`, `animation-step.tsx`, `render-step.tsx`, `src/components/algorithm/render-panel.tsx`
- Modify: `src/components/algorithm/script-stage.tsx`, `src/components/algorithm/animation-stage.tsx` (chỉ còn phần animation), `src/app/designs/[id]/algorithm/[step]/page.tsx`

**Interfaces:**
- Produces: `<ScriptStep data>`, `<AnimationStep data>`, `<RenderStep data>`, `<RenderPanel …>`.

- [ ] **Step 1: Chuyển `script-stage.tsx` theo quy tắc Task 9 Step 1**

| Action | `success` | Nút |
|---|---|---|
| `beginScript` | "Đã gửi yêu cầu sinh kịch bản" | giữ biểu thức nhãn / "Đang gửi…" |
| `approveStage` | "Đã duyệt kịch bản" | "Duyệt kịch bản" / "Đang duyệt…" (giữ `|| unresolvedAssets` trong `disabled`) |
| `approveAlgorithmAsset` | "Đã xử lý yêu cầu asset" | "Gắn asset đã chọn" / "Đang gắn…" (giữ `|| catalog.length === 0`); "Đưa yêu cầu tạo ảnh vào worker" / "Đang gửi…" |

Đổi `text-warning`/`text-success` giữ nguyên (đã có token ở Task 1). Bỏ `<h2>` tiêu đề lặp, giữ đoạn mô tả.

- [ ] **Step 2: Tạo `script-step.tsx`** (chuyển nguyên props từ trang cũ)

```tsx
import { ScriptStage } from "@/components/algorithm/script-stage";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function ScriptStep({ data }: { data: AlgorithmData }) {
  const { workflow, video, revisions, generationRuns, assetRequests, assetJobRuns, catalog } = data;
  const script = revisions.find((revision) => revision.id === workflow.activeScriptId);
  const run = script?.generationRunId ? generationRuns.find((item) => item.id === script.generationRunId) : undefined;
  return (
    <ScriptStage
      videoId={workflow.videoId}
      concurrencyVersion={workflow.concurrencyVersion}
      acceptedComboId={workflow.acceptedComboId}
      activeRevision={script ? { id: script.id, status: script.status, source: script.source, inputFingerprint: script.inputFingerprint, content: script.content } : undefined}
      acceptedScriptId={workflow.acceptedScriptId}
      runError={run?.error ?? undefined}
      assetRequests={assetRequests
        .filter((request) => request.scriptRevisionId === script?.id)
        .map((request) => ({
          id: request.id, temporaryKey: request.temporaryKey, brief: request.brief, status: request.status, assetId: request.assetId, state: request.state, reason: request.reason,
          error: assetJobRuns.find((job) => job.status === "failed" && (job.metrics as { requestId?: string } | null)?.requestId === request.id)?.error ?? undefined,
        }))}
      seriesId={video.seriesId}
      catalog={catalog.map((item) => ({ variantId: item.variantId, assetId: item.assetId, name: item.name, displayName: item.displayName, kind: item.kind, state: item.state, filePath: item.filePath }))}
    />
  );
}
```

- [ ] **Step 3: Tách `animation-stage.tsx` thành phần animation**

Viết lại file, chỉ giữ phần sinh và duyệt animation, dùng hook mới. Nội dung hoàn chỉnh:

```tsx
"use client";

import { approveStage, beginAnimation } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { AnimationPreview } from "@/components/algorithm/animation-preview";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import type { AlgorithmAnimationV1 } from "@/lib/algorithm/contracts";

export function AnimationStage({ videoId, concurrencyVersion, acceptedScriptId, activeRevision, runError }: {
  videoId: string;
  concurrencyVersion: number;
  acceptedScriptId: string | null;
  activeRevision?: { id: string; status: string; inputFingerprint: string; content: unknown };
  runError?: string;
}) {
  const [beginState, beginAction, beginning] = useActionFeedback(beginAnimation, { success: "Đã gửi yêu cầu sinh animation" });
  const [approveState, approveAction, approving] = useActionFeedback(approveStage, { success: "Đã duyệt animation" });
  const animation = activeRevision?.content as Partial<AlgorithmAnimationV1> | undefined;
  const canGenerate = Boolean(acceptedScriptId) && (!activeRevision || ["failed", "rejected", "stale", "approved"].includes(activeRevision.status));

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <p className="text-muted-foreground">LLM chỉ tạo JSON declarative; worker render bằng composition Remotion cố định.</p>
      {!acceptedScriptId ? (
        <p className="text-muted-foreground">Duyệt kịch bản và xử lý asset trước khi sinh animation.</p>
      ) : (
        <>
          {canGenerate && (
            <form action={beginAction} className="flex flex-col gap-2">
              <input type="hidden" name="videoId" value={videoId} />
              <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
              <ActionButton size="sm" pending={beginning} className="self-start">Đưa yêu cầu animation vào worker</ActionButton>
              {beginState.error && <p className="text-xs text-destructive">{beginState.error}</p>}
            </form>
          )}
          {runError && <p className="text-xs text-destructive">Lỗi job animation: {runError}</p>}
          {activeRevision?.status === "generating" && <p>Đang chờ worker sinh animation…</p>}
          {animation && activeRevision && activeRevision.status !== "generating" && (
            <div className="flex flex-col gap-3 rounded-md bg-muted/40 p-3">
              <p className="font-medium">Animation · {activeRevision.status} · {animation.width}×{animation.height} · {animation.fps} fps · {(animation.durationFrames ?? 0) / 30}s</p>
              <AnimationPreview value={animation} />
              {(animation.scenes ?? []).map((scene) => (
                <article key={scene.id} className="rounded-md border bg-background p-3">
                  <h3 className="font-semibold">{scene.title || scene.id} · frame {scene.from}–{scene.from + scene.durationFrames}</h3>
                  {scene.values.length > 0 && <p className="mt-2">Dữ liệu: {scene.values.map((value, index) => (index === scene.highlightIndex ? <strong key={index}>[{value}] </strong> : <span key={index}>{value} </span>))}</p>}
                  {scene.code && <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono">{scene.code}</pre>}
                  {scene.narration.map((line, index) => <p key={`n-${index}`} className="mt-2">Lời thoại: {line}</p>)}
                  {scene.subtitles.map((line, index) => <p key={`s-${index}`} className="mt-1 text-muted-foreground">Phụ đề: {line}</p>)}
                </article>
              ))}
              {activeRevision.status === "pending_review" && (
                <form action={approveAction}>
                  <input type="hidden" name="videoId" value={videoId} />
                  <input type="hidden" name="revisionId" value={activeRevision.id} />
                  <input type="hidden" name="stage" value="animation" />
                  <input type="hidden" name="expectedFingerprint" value={activeRevision.inputFingerprint} />
                  <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
                  <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…">Duyệt animation</ActionButton>
                  {approveState.error && <p className="mt-2 text-xs text-destructive">{approveState.error}</p>}
                </form>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Tạo `render-panel.tsx`** (phần render và duyệt video, tách từ `animation-stage.tsx` cũ)

```tsx
"use client";

import { approveFinalVideo, beginFinalRender, rejectFinalVideo } from "@/app/algorithm/actions";
import { ActionButton } from "@/components/action-button";
import { useActionFeedback } from "@/hooks/use-action-feedback";

const textareaClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function RenderPanel({ videoId, concurrencyVersion, acceptedAnimationId, output, outputRunError }: {
  videoId: string;
  concurrencyVersion: number;
  acceptedAnimationId: string | null;
  output?: { id: string; filePath: string | null; durationFrames: number; inputFingerprint: string; status: string; error: string | null };
  outputRunError?: string;
}) {
  const [renderState, renderAction, rendering] = useActionFeedback(beginFinalRender, { success: "Đã gửi yêu cầu render MP4" });
  const [approveState, approveAction, approving] = useActionFeedback(approveFinalVideo, { success: "Đã duyệt video cuối" });
  const [rejectState, rejectAction, rejecting] = useActionFeedback(rejectFinalVideo, { success: "Đã từ chối video, có thể render lại" });
  const canRender = Boolean(acceptedAnimationId) && (!output || ["failed", "rejected", "stale"].includes(output.status));

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      {!acceptedAnimationId ? (
        <p className="text-muted-foreground">Duyệt animation trước khi render video.</p>
      ) : (
        <>
          {output?.status === "generating" && <p>Worker đang render MP4…</p>}
          {output?.status === "failed" && <p className="text-xs text-destructive">Render lỗi: {output.error || outputRunError}</p>}
          {output?.filePath && ["pending_review", "approved", "rejected"].includes(output.status) && (
            <div className="flex flex-col gap-3 rounded-md border p-3">
              <p className="font-medium">Video {output.status} · {output.durationFrames / 30}s</p>
              <video controls preload="metadata" className="w-full max-w-sm rounded-lg" src={`/api/files/${output.filePath}`} />
              <a className="text-sm underline" href={`/api/files/${output.filePath}`} download>⬇ Tải MP4</a>
              <p className="text-xs break-all text-muted-foreground">Output {output.id} · fingerprint {output.inputFingerprint}</p>
            </div>
          )}
          {canRender && (
            <form action={renderAction} className="flex flex-col gap-2">
              <input type="hidden" name="videoId" value={videoId} />
              <input type="hidden" name="concurrencyVersion" value={concurrencyVersion} />
              <ActionButton size="sm" pending={rendering} className="self-start">Đưa render MP4 vào worker</ActionButton>
              {renderState.error && <p className="text-xs text-destructive">{renderState.error}</p>}
            </form>
          )}
          {output?.status === "pending_review" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <form action={approveAction} className="flex flex-col gap-2">
                <input type="hidden" name="videoId" value={videoId} />
                <input type="hidden" name="outputId" value={output.id} />
                <input type="hidden" name="expectedFingerprint" value={output.inputFingerprint} />
                <ActionButton size="sm" pending={approving} pendingLabel="Đang duyệt…">Duyệt video cuối</ActionButton>
                {approveState.error && <p className="text-xs text-destructive">{approveState.error}</p>}
              </form>
              <form action={rejectAction} className="flex flex-col gap-2">
                <input type="hidden" name="videoId" value={videoId} />
                <input type="hidden" name="outputId" value={output.id} />
                <input type="hidden" name="expectedFingerprint" value={output.inputFingerprint} />
                <textarea name="reason" required minLength={5} rows={2} className={textareaClass} placeholder="Lý do từ chối (ít nhất 5 ký tự)" />
                <ActionButton size="sm" variant="outline" pending={rejecting} pendingLabel="Đang gửi…">Từ chối và render lại animation</ActionButton>
                {rejectState.error && <p className="text-xs text-destructive">{rejectState.error}</p>}
              </form>
            </div>
          )}
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Tạo `animation-step.tsx` và `render-step.tsx`**

`animation-step.tsx`:

```tsx
import { AnimationStage } from "@/components/algorithm/animation-stage";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function AnimationStep({ data }: { data: AlgorithmData }) {
  const { workflow, revisions, generationRuns } = data;
  const animation = revisions.find((revision) => revision.id === workflow.activeAnimationId);
  const run = animation?.generationRunId ? generationRuns.find((item) => item.id === animation.generationRunId) : undefined;
  return (
    <AnimationStage
      videoId={workflow.videoId}
      concurrencyVersion={workflow.concurrencyVersion}
      acceptedScriptId={workflow.acceptedScriptId}
      activeRevision={animation ? { id: animation.id, status: animation.status, inputFingerprint: animation.inputFingerprint, content: animation.content } : undefined}
      runError={run?.error ?? undefined}
    />
  );
}
```

`render-step.tsx`:

```tsx
import { RenderPanel } from "@/components/algorithm/render-panel";
import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function RenderStep({ data }: { data: AlgorithmData }) {
  const { workflow, outputs, generationRuns } = data;
  const output = outputs.find((item) => item.id === workflow.activeOutputId);
  return (
    <RenderPanel
      videoId={workflow.videoId}
      concurrencyVersion={workflow.concurrencyVersion}
      acceptedAnimationId={workflow.acceptedAnimationId}
      output={output ? { id: output.id, filePath: output.filePath, durationFrames: output.durationFrames, inputFingerprint: output.inputFingerprint, status: output.status, error: output.error } : undefined}
      outputRunError={generationRuns.find((run) => run.stage === "render" && run.status === "failed")?.error ?? undefined}
    />
  );
}
```

- [ ] **Step 6: Hoàn thiện `renderStep` trong `[step]/page.tsx`**

Thêm import `ScriptStep`, `AnimationStep`, `RenderStep` và thay `renderStep`:

```tsx
function renderStep(key: StepKey, data: AlgorithmData) {
  switch (key) {
    case "problem": return <ProblemStep data={data} />;
    case "solution": return <SolutionStep data={data} />;
    case "combo": return <ComboStep data={data} />;
    case "script": return <ScriptStep data={data} />;
    case "animation": return <AnimationStep data={data} />;
    case "render": return <RenderStep data={data} />;
  }
}
```

- [ ] **Step 7: Xác minh**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Trình duyệt: đi qua bước Kịch bản (gắn asset, duyệt), Animation (đưa vào worker, xem preview, duyệt), Video (render, xem, duyệt hoặc từ chối). Với mỗi nút: spinner, toast, dữ liệu tự cập nhật. Ghi rõ bước nào không thử được (cần worker, LLM, Chrome headless).

- [ ] **Step 8: Commit**

```bash
git add src/components/algorithm/steps/script-step.tsx src/components/algorithm/steps/animation-step.tsx src/components/algorithm/steps/render-step.tsx src/components/algorithm/render-panel.tsx src/components/algorithm/script-stage.tsx src/components/algorithm/animation-stage.tsx src/app/designs/[id]/algorithm/[step]/page.tsx
git commit -m "feat(algorithm): move script, animation and render into step pages"
```

---

### Task 11: Sidebar, thanh đầu trang, chuông thông báo

**Files:**
- Create: `src/components/app-topbar.tsx`, `src/components/notification-bell.tsx`
- Modify: `src/components/app-sidebar.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: `ActivityEvent` (Task 5), `/api/activity`.
- Produces: `<AppTopbar />`, `<NotificationBell />`.

- [ ] **Step 1: Viết lại `app-sidebar.tsx`** theo nhóm chức năng (giữ nguyên href, quy tắc `isActive` hiện có)

```tsx
"use client";

import { ActivityIcon, FilmIcon, FolderTreeIcon, LayoutDashboardIcon, MicIcon, ShapesIcon, WrenchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }> };

const GROUPS: { title: string; links: NavLink[] }[] = [
  {
    title: "Sản xuất",
    links: [
      { href: "/", label: "Tổng quan", icon: LayoutDashboardIcon },
      { href: "/series", label: "Bộ phim", icon: FilmIcon },
      { href: "/projects", label: "Project", icon: FolderTreeIcon },
    ],
  },
  { title: "Hệ thống", links: [{ href: "/jobs", label: "Jobs", icon: ActivityIcon }] },
  {
    title: "Công cụ",
    links: [
      { href: "/scenes/playground", label: "Sân thử JSON cảnh", icon: ShapesIcon },
      { href: "/tools/tts-tester", label: "Thử giọng đọc TTS", icon: MicIcon },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  // Trang design thuộc khu vực Project.
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/projects" && pathname.startsWith("/designs")));
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 text-sidebar-foreground">
      <Link href="/" className="flex items-center gap-2 px-2 text-lg font-semibold">
        <WrenchIcon className="size-5" /> Cartoon
      </Link>
      {GROUPS.map((group) => (
        <nav key={group.title} aria-label={group.title} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</p>
          {group.links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isActive(href) && "bg-sidebar-accent font-medium")}>
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
      ))}
    </aside>
  );
}
```

- [ ] **Step 2: Tạo `notification-bell.tsx`**

```tsx
"use client";

import { BellIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ALGORITHM_STAGE_LABELS } from "@/lib/video/kind";
import type { ActivityEvent } from "@/lib/algorithm/activity-types";
import { timeAgo } from "@/lib/format";

const STORAGE_KEY = "cartoon.activity.lastSeen";
const POLL_MS = 15_000;

const KIND_TEXT: Record<ActivityEvent["kind"], string> = { running: "đang chạy", ready: "xong, chờ bạn xem", failed: "bị lỗi" };

function readLastSeen(): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? Number(raw) : Date.now();
  } catch {
    return Date.now();
  }
}

export function NotificationBell() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [lastSeen, setLastSeen] = useState<number>(() => Date.now());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setLastSeen(readLastSeen());
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const response = await fetch("/api/activity", { cache: "no-store" });
          if (response.ok) {
            const data = (await response.json()) as { events: ActivityEvent[] };
            if (!stopped) setEvents(data.events);
          }
        } catch {
          // Mất kết nối: giữ danh sách cũ, lần sau thử lại.
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  const unread = events.filter((event) => event.kind !== "running" && Date.parse(event.at) > lastSeen).length;

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      const now = Date.now();
      setLastSeen(now);
      try {
        window.localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // localStorage bị chặn: chấp nhận không nhớ mốc đã đọc.
      }
    }
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : "Thông báo"} className="relative">
          <BellIcon />
          {unread > 0 && <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] text-white">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Thông báo</SheetTitle>
          <SheetDescription>Hoạt động job trong 24 giờ gần nhất, ở mọi bài giảng.</SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-2 px-4 pb-4 text-sm">
          {events.length === 0 && <li className="text-muted-foreground">Chưa có hoạt động nào.</li>}
          {events.map((event) => (
            <li key={`${event.id}-${event.kind}`}>
              <Link href={`/designs/${event.designId}/algorithm/${event.stage === "assets" ? "script" : event.stage}`} onClick={() => onOpenChange(false)} className="flex flex-col rounded-md border p-3 hover:bg-muted">
                <span className="font-medium">{event.title}</span>
                <span className="text-muted-foreground">
                  {ALGORITHM_STAGE_LABELS[event.stage] ?? event.stage} {KIND_TEXT[event.kind]} · {timeAgo(new Date(event.at))}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: Tạo `app-topbar.tsx`** (chuông và nút sáng/tối)

```tsx
"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";

export function AppTopbar() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="mb-4 flex justify-end gap-1">
      <NotificationBell />
      <Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng hoặc tối" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
        <SunIcon className="hidden dark:block" />
        <MoonIcon className="dark:hidden" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Gắn vào `layout.tsx`**

```tsx
<main className="min-w-0 flex-1 p-6">
  <AppTopbar />
  {children}
</main>
```

với `import { AppTopbar } from "@/components/app-topbar";`.

- [ ] **Step 5: Xác minh**

```bash
npm run lint && npx tsc --noEmit
```

Trình duyệt: sidebar có biểu tượng, mục active đúng; chuông hiện số chưa đọc sau khi một job đổi trạng thái, mở bảng thì số về 0 và tải lại trang vẫn giữ nguyên; nút sáng/tối đổi giao diện; thử ở 360 px (stepper cuộn ngang, không tràn trang).

- [ ] **Step 6: Commit**

```bash
git add src/components/app-sidebar.tsx src/components/app-topbar.tsx src/components/notification-bell.tsx src/app/layout.tsx
git commit -m "feat(ui): regroup sidebar and add notification bell and theme toggle"
```

---

### Task 12: Dọn trang TTS, gỡ AutoRefresh, cập nhật tài liệu, kiểm tra cuối

**Files:**
- Modify: `src/components/tools/tts-tester.tsx`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-24-ui-workspace-design.md`

- [ ] **Step 1: Sửa hướng dẫn khởi động lỗi thời trong `tts-tester.tsx`**

Thay khối lệnh `D:\tmp\vieneu-spike\...` (dòng chứa `uvicorn server:app --app-dir D:\tmp\vieneu-spike`) bằng lệnh Docker đúng theo spec TTS (`docs/superpowers/specs/2026-10-24-docker-tts-service.md`):

```tsx
<code className="mt-1 inline-block rounded bg-black/10 px-2 py-0.5 font-mono text-foreground dark:bg-white/10">
  docker compose up -d --build tts
</code>
```

Đổi nút "🔊 Đọc thử ngay" sang `ActionButton`:

```tsx
<ActionButton onClick={handleGenerate} pending={loading} pendingLabel="Đang sinh âm thanh..." disabled={!text.trim()}>
  🔊 Đọc thử ngay
</ActionButton>
```

(thêm `import { ActionButton } from "@/components/action-button";`, bỏ import `Button` nếu không còn dùng) và trong `handleGenerate` thêm `toast.error(message)` ở nhánh `catch` (import `toast` từ `sonner`). Đổi `bg-green-500`/`bg-yellow-500` chấm trạng thái thành `bg-success`/`bg-warning`. Không đổi gì khác (UI voice đầy đủ thuộc dự án B).

- [ ] **Step 2: Gỡ `AutoRefresh` còn sót ở trang bài giảng**

Dùng công cụ Grep tìm `AutoRefresh` trong `src/app/designs/[id]/algorithm` và `src/components/algorithm`. Expected: không còn tham chiếu (trang cũ đã bị thay ở Task 8). Giữ nguyên `src/components/auto-refresh.tsx` vì các trang khác còn dùng.

- [ ] **Step 3: Cập nhật tài liệu**

Trong `CLAUDE.md`, mục "Kiến trúc", thêm một gạch đầu dòng (theo giọng các mục hiện có):

```markdown
- **Workspace bài giảng (A, 2026-10-24):** `/designs/[id]/algorithm/[step]` (6 bước: problem, solution, combo, script, animation, render; asset nằm trong bước script vì workflow không đi qua stage `assets`). `deriveStepStates` (`src/lib/algorithm/steps.ts`) suy trạng thái bước từ `getAlgorithmWorkflow`, bọc `React.cache` ở `workflow-cache.ts`. Phản hồi hành động: `useActionFeedback` (toast + `router.refresh()`, không dùng cho action kết thúc bằng `redirect()`) và `ActionButton`; `Toaster`/`ThemeProvider` ở `components/providers.tsx`. Trạng thái job: `ActivityProvider` poll `GET /api/designs/[id]/activity` (2 giây khi có job chạy, 10 giây khi rảnh, dừng khi tab ẩn) và chỉ `router.refresh()` khi chữ ký hoạt động đổi; chuông thông báo đọc `GET /api/activity` (24 giờ gần nhất, "đã đọc" lưu `localStorage`). Cả hai endpoint chỉ đọc, không có bảng thông báo.
```

Trong spec, cập nhật §4.1 (breadcrumb ở layout design, thanh đầu trang chỉ có chuông và nút sáng/tối) và §3, §5 (chỉ cài `sonner sheet tooltip badge skeleton`).

- [ ] **Step 4: Kiểm tra cuối**

```bash
npm run lint && npx tsc --noEmit && npm run build
```

Rồi đi qua checklist trình duyệt đầy đủ trên một design bài giảng thật:

1. `/designs/<id>/algorithm` chuyển tới bước hiện hành; stepper đúng trạng thái; bước khóa có tooltip và không bấm được; URL bước khóa hiện `LockedStep`.
2. Mỗi nút hành động: spinner khi chờ, không bấm đúp được, toast thành công hoặc lỗi, dữ liệu tự cập nhật.
3. Job chạy: `JobStatusBar` hiện hàng đợi, đồng hồ, thử lại n/3; tự cập nhật khi xong; chặn mạng thử mất kết nối thì hiện cảnh báo và tự phục hồi.
4. Chuông: đếm chưa đọc, mở bảng về 0, liên kết đúng bước.
5. Ngăn kéo lịch sử; chế độ tối; 360 px.
6. Console trình duyệt không có lỗi hydration/React.

Báo cáo trung thực những mục không thử được và lý do.

- [ ] **Step 5: Commit (hai commit riêng)**

```bash
git add src/components/tools/tts-tester.tsx
git commit -m "fix(tools): correct tts tester startup hint and add pending feedback"
git add CLAUDE.md docs/superpowers/specs/2026-10-24-ui-workspace-design.md
git commit -m "docs: describe algorithm workspace and activity polling"
```

---

## Self-Review (đối chiếu spec)

| Yêu cầu spec | Task |
|---|---|
| §3 primitive shadcn | 1 (rút gọn còn 5, có ghi lệch) |
| §4.1 providers, sidebar, topbar, bell | 2, 11 |
| §4.2 route theo bước, stepper, khóa + tooltip, huy hiệu, "Việc tiếp theo", lịch sử ngăn kéo, `STEPS` cấu hình | 7, 8, 9, 10 |
| §4.3 `useActionFeedback`, `ActionButton`, lỗi hiện cả toast lẫn inline, `router.refresh()` | 4, 9, 10 |
| §4.4 endpoint hoạt động, `ActivityProvider`, `JobStatusBar` | 5, 6 |
| §4.5 chuông toàn cục, `localStorage`, không thêm bảng | 5, 11 |
| §4 dọn `tts-tester` | 12 |
| §6 backoff mất kết nối, `localStorage` chặn, bước khóa qua URL, 360 px | 6, 8, 11, 12 |
| §7 chỉ lint/tsc/build + xem trình duyệt | mọi task |

Kiểu nhất quán: `UiStatus` (Task 3) dùng ở 7, 8; `DesignActivity`/`RunActivity` (Task 5) dùng ở 6; `StepState`/`StepKey` (Task 7) dùng ở 8; `AlgorithmData` (Task 7) dùng ở 8-10; `useActionFeedback` trả `[state, action, pending]` như `useActionState` nên chỗ dùng cũ không đổi cấu trúc.

Rủi ro đã biết: (1) điều kiện tiên quyết về thay đổi chưa commit; (2) `useActionFeedback` chưa kiểm chứng với action có `redirect()` nên chỉ áp cho action stage; (3) hành vi `Tooltip`/`Sheet` của biến thể `radix-nova` cần đối chiếu file sinh ra ở Task 1 Step 2.
