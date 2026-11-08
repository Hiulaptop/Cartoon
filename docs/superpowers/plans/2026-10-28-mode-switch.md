# Công tắc chế độ Cartoon | Giảng bài Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm công tắc chế độ Cartoon | Giảng bài ở topbar để trang chủ, cây Project, tạo design và sidebar chỉ hiện nội dung của loại video đang chọn.

**Architecture:** Chế độ là cookie `mode` ở server (nguồn sự thật duy nhất), đọc bằng `getMode()` ở các server component và truyền xuống client bằng props. Server action `setMode` ghi cookie; `ModeSwitch` dùng `useOptimistic`; `ModeSync` đồng bộ cookie theo `video.kind` khi mở design của loại kia. Lọc cây Project là hàm thuần chỉ dùng để hiển thị.

**Tech Stack:** Next.js 15.5.28 (App Router, Server Actions, `cookies()` async), React 19.1.0, TypeScript 5.9.3, Tailwind 4, sonner.

**Spec:** `docs/superpowers/specs/2026-10-28-mode-switch-design.md` (đã được user duyệt trong chat ngày 2026-10-28).

## Global Constraints

- **Không viết và không chạy test** (AGENTS.md luật 4–6). Kiểm chứng bằng `npx tsc --noEmit`, `npm run lint`, `npm run build` và duyệt tay (Task 7).
- Không đổi schema, không đổi hợp đồng dữ liệu. Không thêm `middleware.ts`.
- Cookie `mode` chỉ để **hiển thị**. Server action và worker không đọc cookie; loại video lấy từ trường form `kind` hoặc `videos.kind` (spec S2).
- File `"use server"` chỉ được export hàm async (không export hằng số/type). Hằng số chế độ nằm ở `src/lib/mode.ts`.
- Next 15.5: không dùng `refresh` hay `updateTag` (API của bản mới hơn). Dùng `revalidatePath("/", "layout")`.
- Cookie: `path: "/"`, `sameSite: "lax"`, `httpOnly: true`, `maxAge` 1 năm, không đặt `secure`.
- Cây dùng cho kiểm tra "trống"/an toàn xoá phải là cây **chưa lọc** (spec S5).
- Tiếng Việt cho chuỗi giao diện và comment, khớp code hiện có.
- Bước "Commit" chỉ thực hiện nếu user đã yêu cầu commit trong chat; mỗi commit chọn file tường minh (không `git add -A`/`.`), theo Conventional Commits, kèm dòng cuối `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

### Task 1: Lõi chế độ (hằng số, đọc cookie, server action)

**Files:**
- Create: `src/lib/mode.ts`
- Create: `src/lib/mode-server.ts`
- Create: `src/app/mode-actions.ts`

**Interfaces:**
- Produces: `type Mode = VideoKind`; `MODES: readonly Mode[]`; `DEFAULT_MODE`; `MODE_COOKIE`; `MODE_LABELS: Record<Mode, string>`; `isMode(v: unknown): v is Mode`; `parseMode(raw: string | null | undefined): Mode` (từ `@/lib/mode`).
- Produces: `getMode(): Promise<Mode>` (từ `@/lib/mode-server`, server-only, bọc `React.cache`).
- Produces: `setMode(mode: string, redirectTo?: string): Promise<{ error?: string }>` (từ `@/app/mode-actions`).

- [ ] **Step 1: Tạo `src/lib/mode.ts`**

```ts
import type { VideoKind } from "@/lib/video/kind";

// Chế độ giao diện dùng đúng từ vựng của loại video để khỏi phải ánh xạ qua lại.
export type Mode = VideoKind;

export const MODES: readonly Mode[] = ["cartoon", "algorithm"];
export const DEFAULT_MODE: Mode = "cartoon";
export const MODE_COOKIE = "mode";

export const MODE_LABELS: Record<Mode, string> = {
  cartoon: "Cartoon",
  algorithm: "Giảng bài",
};

export const isMode = (value: unknown): value is Mode => MODES.some((mode) => mode === value);

// Giá trị thiếu hoặc sai luôn về chế độ mặc định (spec S3).
export const parseMode = (raw: string | null | undefined): Mode => (isMode(raw) ? raw : DEFAULT_MODE);
```

- [ ] **Step 2: Tạo `src/lib/mode-server.ts`**

```ts
import { cookies } from "next/headers";
import { cache } from "react";

import { MODE_COOKIE, parseMode, type Mode } from "@/lib/mode";

// Đọc chế độ từ cookie, mỗi request một lần. Chỉ dùng để quyết định cái gì được hiện;
// server action và worker không bao giờ dựa vào giá trị này (spec S2).
export const getMode = cache(async (): Promise<Mode> => parseMode((await cookies()).get(MODE_COOKIE)?.value));
```

- [ ] **Step 3: Tạo `src/app/mode-actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isMode, MODE_COOKIE } from "@/lib/mode";

// Chỉ cho chuyển về các đường dẫn này để không thành open redirect.
const REDIRECT_ALLOWLIST: readonly string[] = ["/"];
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Ghi chế độ hiển thị. Đầu vào đến từ client nên kiểm bằng allowlist. Ghi cookie trong Server Action làm
// server render lại trang hiện tại; revalidatePath ở layout gốc là dự phòng. redirect() ném ngoại lệ điều khiển
// nên phải đặt cuối cùng.
export async function setMode(mode: string, redirectTo?: string): Promise<{ error?: string }> {
  if (!isMode(mode)) return { error: "Chế độ không hợp lệ." };
  if (redirectTo !== undefined && !REDIRECT_ALLOWLIST.includes(redirectTo)) return { error: "Đích chuyển trang không hợp lệ." };

  (await cookies()).set(MODE_COOKIE, mode, { path: "/", sameSite: "lax", httpOnly: true, maxAge: ONE_YEAR_SECONDS });
  revalidatePath("/", "layout");
  if (redirectTo !== undefined) redirect(redirectTo);
  return {};
}
```

- [ ] **Step 4: Kiểm tra kiểu**

Run: `npx tsc --noEmit`
Expected: không có lỗi.

- [ ] **Step 5: Commit (chỉ khi user yêu cầu)**

```bash
git add src/lib/mode.ts src/lib/mode-server.ts src/app/mode-actions.ts
git commit -m "feat(mode): add display mode cookie and setMode action"
```

---

### Task 2: Công tắc ở topbar, sidebar theo chế độ, layout gốc

**Files:**
- Create: `src/components/mode-switch.tsx`
- Modify (thay toàn bộ nội dung): `src/components/app-topbar.tsx`, `src/components/app-sidebar.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `Mode`, `MODES`, `MODE_LABELS` (`@/lib/mode`), `setMode` (`@/app/mode-actions`), `getMode` (`@/lib/mode-server`).
- Produces: `ModeSwitch({ mode: Mode })`; `AppTopbar({ mode: Mode })`; `AppSidebar({ mode: Mode })`; `SidebarNav({ mode: Mode; onNavigate?: () => void })`.

- [ ] **Step 1: Tạo `src/components/mode-switch.tsx`**

```tsx
"use client";

import { usePathname } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { setMode } from "@/app/mode-actions";
import { MODES, MODE_LABELS, type Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";

// `mode` từ props là nguồn thật (đọc từ cookie ở server). useOptimistic chỉ để tab sáng ngay khi bấm; thất bại
// thì tự trả về giá trị thật. Bấm cả tab đang sáng vẫn gọi action để sửa trường hợp snapshot Back/Forward bị lệch.
export function ModeSwitch({ mode }: { mode: Mode }) {
  const pathname = usePathname();
  const [optimistic, setOptimistic] = useOptimistic(mode);
  const [pending, startTransition] = useTransition();

  const select = (next: Mode) =>
    startTransition(async () => {
      setOptimistic(next);
      try {
        // Ở trang design phải rời đi, nếu không ModeSync sẽ ép chế độ về loại của design.
        const result = await setMode(next, pathname.startsWith("/designs") ? "/" : undefined);
        if (result.error) toast.error(result.error);
      } catch {
        toast.error("Không đổi được chế độ. Thử lại sau.");
      }
    });

  return (
    <div role="tablist" aria-label="Chế độ" aria-busy={pending} className="inline-flex rounded-lg border p-0.5">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={optimistic === m}
          onClick={() => select(m)}
          className={cn(
            "rounded-md px-3 py-1 text-sm transition-colors",
            optimistic === m ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Thay `src/components/app-topbar.tsx`**

```tsx
"use client";

import { MenuIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { SidebarNav } from "@/components/app-sidebar";
import { ModeSwitch } from "@/components/mode-switch";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Mode } from "@/lib/mode";

export function AppTopbar({ mode }: { mode: Mode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="mb-4 flex items-center justify-between gap-1">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mở menu" className="md:hidden">
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-sidebar p-4 text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Điều hướng giữa các khu vực của ứng dụng</SheetDescription>
          </SheetHeader>
          <SidebarNav mode={mode} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <ModeSwitch mode={mode} />
      <div className="ml-auto flex gap-1">
        <NotificationBell />
        <Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng hoặc tối" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <SunIcon className="hidden dark:block" />
          <MoonIcon className="dark:hidden" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Thay `src/components/app-sidebar.tsx`**

```tsx
"use client";

import { ActivityIcon, FilmIcon, FolderTreeIcon, LayoutDashboardIcon, MicIcon, ShapesIcon, WrenchIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Mode } from "@/lib/mode";
import { cn } from "@/lib/utils";

// `modes` bỏ trống nghĩa là hiện ở mọi chế độ.
type NavLink = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; modes?: readonly Mode[] };

// Bước 1 (asset) nằm trong Bộ phim; bước 2–7 nằm trong từng bản thiết kế (thuộc Project).
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
      { href: "/scenes/playground", label: "Sân thử JSON cảnh", icon: ShapesIcon, modes: ["cartoon"] },
      { href: "/tools/tts-tester", label: "Thử giọng đọc TTS", icon: MicIcon, modes: ["algorithm"] },
    ],
  },
];

// Nội dung điều hướng dùng chung cho sidebar (từ md trở lên) và menu trượt trên màn hình hẹp.
export function SidebarNav({ mode, onNavigate }: { mode: Mode; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Trang design thuộc khu vực Project.
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href) || (href === "/projects" && pathname.startsWith("/designs"));
  const groups = GROUPS.map((group) => ({ ...group, links: group.links.filter((link) => !link.modes || link.modes.includes(mode)) })).filter(
    (group) => group.links.length > 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-2 px-2 text-lg font-semibold">
        <WrenchIcon className="size-5" /> Cartoon
      </Link>
      {groups.map((group) => (
        <nav key={group.title} aria-label={group.title} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.title}</p>
          {group.links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={isActive(href) ? "page" : undefined}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isActive(href) && "bg-sidebar-accent font-medium")}
            >
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
      ))}
    </div>
  );
}

export function AppSidebar({ mode }: { mode: Mode }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-4 text-sidebar-foreground md:block">
      <SidebarNav mode={mode} />
    </aside>
  );
}
```

- [ ] **Step 4: Sửa `src/app/layout.tsx`**

Thêm import (cạnh các import `@/...` khác):

```tsx
import { getMode } from "@/lib/mode-server";
```

Đổi chữ ký hàm và thân (thêm `async` và đọc chế độ):

```tsx
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const mode = await getMode();
  return (
```

Đổi hai chỗ dùng:

```tsx
            <AppSidebar mode={mode} />
            <main className="min-w-0 flex-1 p-4 md:p-6">
              <AppTopbar mode={mode} />
```

- [ ] **Step 5: Kiểm tra kiểu và lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: không lỗi, không cảnh báo mới.

- [ ] **Step 6: Commit (chỉ khi user yêu cầu)**

```bash
git add src/components/mode-switch.tsx src/components/app-topbar.tsx src/components/app-sidebar.tsx src/app/layout.tsx
git commit -m "feat(ui): add Cartoon/Giảng bài mode switch to topbar and sidebar"
```

---

### Task 3: Đồng bộ chế độ theo design (`ModeSync`)

**Files:**
- Create: `src/components/designs/mode-sync.tsx`
- Modify: `src/app/designs/[id]/layout.tsx`

**Interfaces:**
- Consumes: `setMode` (`@/app/mode-actions`), `getMode` (`@/lib/mode-server`), `Mode`.
- Produces: `ModeSync({ designId: string; kind: Mode })` (render `null`).

- [ ] **Step 1: Tạo `src/components/designs/mode-sync.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

import { setMode } from "@/app/mode-actions";
import type { Mode } from "@/lib/mode";

// Mở design của loại khác chế độ hiện tại thì kéo cookie về loại của design (spec S4). Chỉ gọi một lần cho mỗi
// cặp (design, loại): nếu trình duyệt từ chối cookie, layout vẫn render lại ModeSync nhưng khóa này chặn vòng lặp.
export function ModeSync({ designId, kind }: { designId: string; kind: Mode }) {
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    const key = `${designId}:${kind}`;
    if (attempted.current === key) return;
    attempted.current = key;
    setMode(kind)
      .then((result) => {
        if (result.error) toast.error(result.error);
      })
      .catch(() => toast.error("Không đồng bộ được chế độ."));
  }, [designId, kind]);

  return null;
}
```

- [ ] **Step 2: Sửa `src/app/designs/[id]/layout.tsx`**

Thêm import:

```tsx
import { ModeSync } from "@/components/designs/mode-sync";
import { getMode } from "@/lib/mode-server";
```

Sau dòng `if (!video) notFound();` thêm:

```tsx
  const mode = await getMode();
```

Ngay trong thẻ `<div className="mx-auto flex max-w-5xl flex-col gap-6">`, dòng đầu tiên:

```tsx
      {mode !== video.kind && <ModeSync designId={id} kind={video.kind} />}
```

- [ ] **Step 3: Kiểm tra kiểu và lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: không lỗi.

- [ ] **Step 4: Commit (chỉ khi user yêu cầu)**

```bash
git add src/components/designs/mode-sync.tsx "src/app/designs/[id]/layout.tsx"
git commit -m "feat(designs): sync display mode to the opened design's kind"
```

---

### Task 4: Lọc cây Project theo chế độ

**Files:**
- Modify: `src/lib/project/tree.ts` (thêm cuối file)
- Modify: `src/app/projects/page.tsx`
- Modify: `src/app/projects/[id]/page.tsx`

**Interfaces:**
- Produces (từ `@/lib/project/tree`): `filterTreeByKind(roots: readonly ProjectNode[], kind: VideoKind): ProjectNode[]`; `countDesigns(nodes: readonly ProjectNode[]): number`.
- Consumes: `getMode`, `MODE_LABELS`, `MODES`, `Mode`.

- [ ] **Step 1: Thêm vào cuối `src/lib/project/tree.ts`**

```ts
// Bản sao cây chỉ giữ design thuộc `kind`; thư mục giữ nguyên. CHỈ dùng để hiển thị:
// kiểm tra "trống" hay chặn xoá phải dùng cây gốc chưa lọc (spec S5).
export function filterTreeByKind(roots: readonly ProjectNode[], kind: VideoKind): ProjectNode[] {
  return roots.map((root) => {
    const copy = new ProjectNode(root.id, root.name, root.parentId);
    copy.projects.push(...filterTreeByKind(root.projects, kind));
    copy.designs.push(...root.designs.filter((design) => design.videoKind === kind));
    return copy;
  });
}

export const countDesigns = (nodes: readonly ProjectNode[]): number => nodes.reduce((total, node) => total + node.summary().designs, 0);
```

- [ ] **Step 2: Sửa `src/app/projects/page.tsx`**

Thêm import:

```tsx
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
```

Đổi import tree thành:

```tsx
import { countDesigns, filterTreeByKind, type ProjectNode } from "@/lib/project/tree";
```

Đầu hàm `ProjectsPage`, trước `let roots`, thêm `const mode = await getMode();`. Sau khối `try/catch`, thêm:

```tsx
  const view = filterTreeByKind(roots, mode);
  const hidden = countDesigns(roots) - countDesigns(view);
```

Thay dòng hiển thị cuối (dòng `{roots.length === 0 && ...}`) bằng:

```tsx
      {roots.length === 0 && !loadError ? <p className="text-sm text-muted-foreground">Chưa có project nào.</p> : <TreeList nodes={view} />}
      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">
          Đang ẩn {hidden} design của chế độ {MODE_LABELS[mode === "cartoon" ? "algorithm" : "cartoon"]}. Đổi chế độ ở đầu trang để xem.
        </p>
      )}
```

(`roots.length === 0` dùng cây chưa lọc nên thông báo "Chưa có project" luôn đúng.)

- [ ] **Step 3: Sửa `src/app/projects/[id]/page.tsx`**

Thêm import:

```tsx
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
```

Đổi import tree thành:

```tsx
import { findProject, filterTreeByKind, type ProjectNode } from "@/lib/project/tree";
```

Sau `if (!node) notFound();` thêm:

```tsx
  const mode = await getMode();
  const view = findProject(filterTreeByKind(roots, mode), id);
  if (!view) notFound();
  const hidden = node.summary().designs - view.summary().designs;
```

Thay khối `{node.projects.length === 0 && node.designs.length === 0 ? (...) : (<TreeList nodes={[node]} />)}` bằng:

```tsx
      {node.projects.length === 0 && node.designs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Thư mục trống.</p>
      ) : (
        <TreeList nodes={[view]} />
      )}
      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">
          Đang ẩn {hidden} design của chế độ {MODE_LABELS[mode === "cartoon" ? "algorithm" : "cartoon"]} trong thư mục này. Đổi chế độ ở đầu trang để xem.
        </p>
      )}
```

Phần "Cài đặt project" (xoá/di chuyển) giữ nguyên, tiếp tục dùng `node` và `roots` chưa lọc.

- [ ] **Step 4: Kiểm tra kiểu và lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: không lỗi.

- [ ] **Step 5: Commit (chỉ khi user yêu cầu)**

```bash
git add src/lib/project/tree.ts src/app/projects/page.tsx "src/app/projects/[id]/page.tsx"
git commit -m "feat(projects): filter project tree designs by display mode"
```

---

### Task 5: Trang chủ theo chế độ

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `getMode`, `MODE_LABELS`, `STEPS` (`@/lib/algorithm/steps`, export có sẵn: `{ key, label, requires }[]`), `PIPELINE_STEPS`.

- [ ] **Step 1: Thêm import**

```tsx
import { STEPS as ALGORITHM_STEPS } from "@/lib/algorithm/steps";
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
```

- [ ] **Step 2: Đọc chế độ và lọc truy vấn "gần đây"**

Đầu `Home()`, thêm `const mode = await getMode();` (trước `getSystemStatus`). Trong `Promise.all`, thêm `.where(eq(videos.kind, mode))` giữa `.leftJoin(...)` và `.orderBy(...)`:

```tsx
    getDb().select({ id: videos.id, title: videos.title, kind: videos.kind, stage: algorithmWorkflows.stage }).from(videos).leftJoin(algorithmWorkflows, eq(algorithmWorkflows.videoId, videos.id)).where(eq(videos.kind, mode)).orderBy(desc(videos.createdAt)).limit(5).catch(() => []),
```

- [ ] **Step 3: Tiêu đề và mô tả theo chế độ**

Đổi `<h1>`:

```tsx
      <h1 className="text-2xl font-semibold">Tổng quan · {MODE_LABELS[mode]}</h1>
```

Đổi mô tả thẻ Bộ phim:

```tsx
            <CardDescription>{mode === "cartoon" ? "Bước 1: asset của từng bộ phim" : "Asset cho cảnh truyện dẫn của từng bộ phim"}</CardDescription>
```

Đổi mô tả thẻ "Bản thiết kế gần đây":

```tsx
            <CardDescription>{mode === "cartoon" ? "Bước 2–7 nằm trong từng bản thiết kế" : "Mỗi bản thiết kế có workspace 7 bước riêng"}</CardDescription>
```

- [ ] **Step 4: Chỉ hiện thẻ giám khảo ở Cartoon; lưới theo số thẻ**

Đổi lưới ba thẻ: `<div className="grid gap-4 md:grid-cols-3">` thành

```tsx
      <div className={mode === "cartoon" ? "grid gap-4 md:grid-cols-3" : "grid gap-4 md:grid-cols-2"}>
```

Bọc thẻ "Đồng thuận giám khảo – người" (toàn bộ `<Card>` cuối trong lưới) bằng `{mode === "cartoon" && ( ... )}`.

- [ ] **Step 5: Quy trình 7 bước theo chế độ**

Thay toàn bộ `<section>` "Quy trình 7 bước" bằng:

```tsx
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Quy trình {MODE_LABELS[mode].toLowerCase()} (7 bước)</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mode === "cartoon"
            ? PIPELINE_STEPS.map((step) => (
                <Card key={step.number} className={step.hidden ? "opacity-60" : undefined}>
                  <CardHeader>
                    <CardTitle>
                      {step.number}. {step.title}
                    </CardTitle>
                    <CardDescription>{step.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">{step.where}</CardContent>
                </Card>
              ))
            : ALGORITHM_STEPS.map((step, index) => (
                <Card key={step.key}>
                  <CardHeader>
                    <CardTitle>
                      {index + 1}. {step.label}
                    </CardTitle>
                    <CardDescription>
                      {step.requires ? `Cần hoàn tất: ${ALGORITHM_STEPS.find((s) => s.key === step.requires)?.label}` : "Bước đầu tiên"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">Bản thiết kế › Workspace giảng bài</CardContent>
                </Card>
              ))}
        </div>
      </section>
```

- [ ] **Step 6: Kiểm tra kiểu và lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: không lỗi. (`agreementRate` vẫn được gọi ở cả hai chế độ; chấp nhận để giữ `Promise.all` đơn giản.)

- [ ] **Step 7: Commit (chỉ khi user yêu cầu)**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): show mode-specific dashboard and pipeline"
```

---

### Task 6: Tạo design khoá theo chế độ

**Files:**
- Modify: `src/components/videos/create-video-form.tsx`
- Modify: `src/app/projects/[id]/new-design/page.tsx`

**Interfaces:**
- Consumes: `Mode`, `MODE_LABELS`, `getMode`.
- Produces: `CreateVideoForm({ projectId: string; series: SeriesOption[]; kind: Mode })`.

- [ ] **Step 1: Sửa `create-video-form.tsx` — props và state**

Thêm import:

```tsx
import { MODE_LABELS, type Mode } from "@/lib/mode";
```

Thay chữ ký và các `useState` đầu hàm (bỏ state `kind`, khởi tạo `seriesId` ngay):

```tsx
export function CreateVideoForm({ projectId, series, kind }: { projectId: string; series: SeriesOption[]; kind: Mode }) {
  const [cartoonState, cartoonAction, cartoonPending] = useActionState<FormState, FormData>(createDesign, {});
  const [algorithmState, algorithmAction, algorithmPending] = useActionState<FormState, FormData>(createAlgorithmDesign, {});
  const available = kind === "cartoon" ? series.filter((s) => s.cartoonReady) : series;
  const [seriesId, setSeriesId] = useState(() => pickSeries(available));
  const state = kind === "algorithm" ? algorithmState : cartoonState;
  const pending = kind === "algorithm" ? algorithmPending : cartoonPending;
  const current = available.find((s) => s.id === seriesId);
```

- [ ] **Step 2: Thay ô chọn loại bằng dòng hiển thị cố định**

Xoá cả `<label>` "Loại video" (thẻ `<select required value={kind} ...>` và mọi `<option>` của nó). Thay bằng:

```tsx
      <p className="text-sm">
        Loại video: <span className="font-medium">{MODE_LABELS[kind]}</span>{" "}
        <span className="text-muted-foreground">(theo chế độ ở đầu trang; muốn tạo loại kia thì đổi chế độ)</span>
      </p>
```

Giữ nguyên hai `<input type="hidden" name="seriesId" .../>` và `<input type="hidden" name="kind" value={kind} />` (React 19 gọi `form.reset()` sau action, nên giá trị phải đi qua input ẩn; `kind` ở đây là prop nên không lệch).

- [ ] **Step 3: Bỏ lớp bọc `{kind && <> ... </>}` và điều kiện `!kind`**

Xoá dòng mở `{kind && <>` (trước label "Bộ phim") và dòng đóng `</>}` (ngay trước `{state.error && ...}`), giữ nguyên nội dung bên trong. Đổi nút gửi:

```tsx
      <Button type="submit" disabled={pending || !current} className="self-start">
```

- [ ] **Step 4: Sửa `new-design/page.tsx`**

Thêm import:

```tsx
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
```

Sau `if (!project) notFound();` thêm `const mode = await getMode();`. Đổi dòng mô tả:

```tsx
        <p className="text-sm text-muted-foreground">Chọn bộ phim làm nguồn asset dùng lại cho bản thiết kế {MODE_LABELS[mode]}.</p>
```

Đổi lời gọi form:

```tsx
        <CreateVideoForm projectId={id} series={options} kind={mode} />
```

- [ ] **Step 5: Kiểm tra kiểu và lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: không lỗi, không còn biến `setKind`/`kind` state sót.

- [ ] **Step 6: Commit (chỉ khi user yêu cầu)**

```bash
git add src/components/videos/create-video-form.tsx "src/app/projects/[id]/new-design/page.tsx"
git commit -m "feat(designs): lock new design kind to the current mode"
```

---

### Task 7: Tài liệu và kiểm chứng toàn bộ

**Files:**
- Modify: `CLAUDE.md` (thêm một gạch đầu dòng ở mục "Kiến trúc")

- [ ] **Step 1: Thêm vào mục "Kiến trúc" của `CLAUDE.md`**

```markdown
- **Chế độ Cartoon | Giảng bài (2026-10-28):** công tắc ở topbar (`components/mode-switch.tsx`). Chế độ là cookie `mode` ở server, đọc bằng `getMode()` (`src/lib/mode-server.ts`), ghi bằng server action `setMode` (`src/app/mode-actions.ts`); `Mode = VideoKind`. Cookie CHỈ để hiển thị (trang chủ, cây Project qua `filterTreeByKind`, sidebar, khoá loại ở form tạo design): server action và worker không đọc nó, loại video lấy từ trường `kind` hoặc `videos.kind`. Ở `/designs/[id]` loại của design thắng cookie (`ModeSync`). Kiểm "trống"/chặn xoá phải dùng cây chưa lọc. Spec: `docs/superpowers/specs/2026-10-28-mode-switch-design.md`.
```

- [ ] **Step 2: Kiểm tra toàn bộ**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: cả ba thành công. Nếu build cảnh báo route động mới thì ghi lại, không coi là lỗi (spec mục 6).

- [ ] **Step 3: Chạy app để duyệt tay**

Cổng 3000 đang do container `app` giữ. Chạy dev ở cổng khác (cần `.env`):

Run: `npx next dev --turbopack -H 127.0.0.1 -p 3100`

Duyệt 8 tình huống ở spec mục 8:
1. Xoá cookie `mode`, vào `/`: chế độ Cartoon.
2. Bấm Giảng bài ở `/`: danh sách và quy trình đổi, F5 vẫn giữ.
3. Đang Cartoon, mở thẳng `/designs/<id giảng bài>`: tab chuyển sang Giảng bài, không lặp vô hạn (xem tab Network chỉ có một lần gọi action).
4. Đang ở design cartoon, bấm Giảng bài: về `/` ở chế độ Giảng bài, không bị kéo ngược.
5. Thư mục chỉ có design của loại kia: không ghi "Thư mục trống", có dòng "Đang ẩn N design…".
6. `Tạo bản thiết kế` ở mỗi chế độ: loại bị khoá đúng, tạo thành công (cartoon cần bộ phim `cartoonReady`).
7. Chặn cookie của trình duyệt: app không lặp, có toast, vẫn dùng được ở Cartoon.
8. Bấm qua lại nhanh nhiều lần: tab cuối thắng, không nhấp nháy kéo dài.

Đặc biệt xác nhận tình huống 2 và 4 trên Next 15.5.28 thật (rủi ro đã ghi ở spec mục 9). Nếu trang không tự đổi sau khi ghi cookie, báo user trước khi thêm `router.refresh()`.

- [ ] **Step 4: Commit tài liệu (chỉ khi user yêu cầu)**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-28-mode-switch-design.md docs/superpowers/plans/2026-10-28-mode-switch.md
git commit -m "docs: describe mode switch design and plan"
```
