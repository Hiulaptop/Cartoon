# Thiết kế: khung UI và workspace bài giảng (dự án A)

- Ngày: 2026-10-24
- Trạng thái: **Bản thiết kế được user duyệt trong chat ngày 2026-10-24; spec này chờ user duyệt bằng văn bản trước khi viết plan.**
- Phạm vi: frontend và một endpoint đọc. **Không đổi schema DB, không đổi hợp đồng dữ liệu** (`contracts.ts`, DSL, server action hiện có).
- Liên quan: `2026-10-23-algorithm-video-design.md` (nghiệp vụ nhánh bài giảng), `2026-10-24-docker-tts-service.md`. Dự án B (pipeline và UI voice) và C (engine animation, preview đồng bộ) có spec riêng, làm sau A.

## 1. Mục tiêu

Sửa các vấn đề user nêu về giao diện nhánh giảng thuật toán:

1. **Quản lý bước kém**: toàn bộ pipeline nằm trong một trang dài; thanh bước chỉ là chữ, không bấm được, không cho biết bước nào khóa, chờ duyệt, lỗi.
2. **Không có phản hồi khi bấm nút**: không có toast, nút chỉ `disabled`, thành công thì im lặng, "Đang chờ worker…" không cho biết job đang ở đâu.
3. **Khung chung xuống cấp**: sidebar phẳng lẫn hai pipeline; chỉ có 3 component shadcn (`button`, `card`, `input`), phần còn lại là Tailwind viết tay.
4. Chuẩn bị chỗ cắm cho voice (B) và preview đồng bộ (C) mà không phải dựng lại workspace.

Hai phàn nàn còn lại (voice chưa có UI/pipeline, video chưa có animation thật) thuộc B và C, nằm ngoài spec này.

## 2. Hiện trạng đã đối chiếu (2026-10-24)

| Thành phần | Thực tế |
|---|---|
| Next.js / React / Tailwind | 15.5.28 / 19.1.0 / 4.x (`package.json`) |
| shadcn | style `radix-nova`, `components.json`; có sẵn `radix-ui ^1.8.1`, `lucide-react`, `tw-animate-css`, `class-variance-authority` |
| `src/components/ui` | chỉ `button.tsx`, `card.tsx`, `input.tsx` |
| Theme | `globals.css` có biến `:root` và `.dark`, `@custom-variant dark`; **chưa có ThemeProvider** |
| Phản hồi | không có toast. `AutoRefresh` gọi `router.refresh()` mỗi 3 giây khi `active` |
| Form | mỗi component tự dùng `useActionState<FormState, FormData>`, `FormState = { error?: string }` (`src/lib/form.ts`); thành công trả `{}` |
| Trang bài giảng | `src/app/designs/[id]/algorithm/page.tsx` (+ `history/page.tsx`); layout `designs/[id]/layout.tsx` dùng chung với hoạt hình |
| Trạng thái dữ liệu | `algorithm_workflows` (`stage`, `active*Id`, `accepted*Id`, `concurrencyVersion`), `algorithm_revisions`, `algorithm_generation_runs` (`status`: queued, running, waiting_review, succeeded, failed, stale), `algorithm_outputs`, `algorithm_asset_requests`, `job_runs` (`status`, `attempts`, `error`, `startedAt`, `finishedAt`) |
| Tiện ích tương tác | `FormState` dùng chung; React 19 gọi `form.reset()` sau action nên select có kiểm soát phải gửi giá trị qua input ẩn (CLAUDE.md) |

Đối chiếu nguồn chính thống:

- `npx shadcn@latest add sonner sheet tooltip tabs badge progress skeleton separator --dry-run` (shadcn CLI 4.22.1, ghi 2026-10-24): tạo 8 file trong `src/components/ui`, thêm phụ thuộc `sonner`, `next-themes`, `cn`; `button.tsx` giữ nguyên. Nội dung `sonner.tsx` đã xem bằng `--view`: dùng `useTheme()` của `next-themes` và `Toaster` của `sonner`.
- `npm view`: `sonner` 2.0.8, `next-themes` 0.4.6.
- sonner.emilkowal.ski (Getting Started): `<Toaster />` đặt ở bất kỳ đâu, kể cả server component như `layout.tsx`; `toast` import từ `sonner` và gọi trong event handler.
- nextjs.org/docs/15 `useRouter`: `router.refresh()` gọi lại server, render lại Server Component và **giữ nguyên state client và vị trí cuộn**.
- Lưu ý: trang docs shadcn mặc định trả về biến thể Base UI (`toast.add`), **không áp dụng** cho style `radix-nova` của repo. Nguồn đúng là CLI và registry như trên. `context7` không có trong phiên làm việc này nên chưa dùng; plan phải đối chiếu lại API `sonner` 2.0.x trước khi code.

## 3. Phạm vi

### Trong phạm vi

- Thêm primitive shadcn: `sonner`, `sheet`, `tooltip`, `tabs`, `badge`, `progress`, `skeleton`, `separator`.
- Khung chung: root layout, sidebar hai khu, thanh đầu trang, chuông thông báo toàn cục.
- Workspace bài giảng mới: route theo bước, stepper, trạng thái bước, "việc tiếp theo".
- Lớp phản hồi hành động: toast, nút có trạng thái chờ, thanh trạng thái job.
- Endpoint đọc hoạt động job (không ghi).
- Dọn trang `tools/tts-tester` theo design system mới, sửa hướng dẫn khởi động lỗi thời.

### Ngoài phạm vi

- Luồng hoạt hình: không viết lại trang (casting, storyboard, render, upload); chỉ hưởng sidebar, toast, màu trạng thái.
- Sinh audio, bước Voice thật, đổi DSL animation, Remotion, Player đồng bộ (B và C).
- Đăng nhập, phân quyền; đổi schema, migration; realtime qua SSE hay `LISTEN/NOTIFY`.
- Viết hoặc chạy test (AGENTS.md luật 4-6).

## 4. Kiến trúc

### 4.1 Khung chung

- `src/app/layout.tsx`: bọc `ThemeProvider` (`next-themes`, `attribute="class"`, `defaultTheme="system"`, khớp `.dark` hiện có) và `TooltipProvider`; đặt `<Toaster />` (component shadcn).
- `AppSidebar`: nhóm theo chức năng (**Sản xuất**: Tổng quan, Bộ phim, Project; **Hệ thống**: Jobs; **Công cụ**), có biểu tượng. Không có trang liệt kê riêng design bài giảng nên không tách nhóm theo loại; điều hướng theo loại do stepper trong từng design đảm nhận. Giữ nguyên href hiện có; mục active tính theo `pathname`.
- `AppTopbar` (mới): breadcrumb và `NotificationBell`.
- `designs/[id]/layout.tsx`: giữ breadcrumb, tên, bộ phim; với `kind === "algorithm"` thay dòng chữ mô tả bằng `AlgorithmShell` (xem 4.2). Với `cartoon` giữ `DesignTabs`.

### 4.2 Workspace bài giảng

Route (mỗi bước một URL, đều `export const dynamic = "force-dynamic"`):

```text
/designs/[id]/algorithm                 -> redirect sang bước hiện tại (workflow.stage)
/designs/[id]/algorithm/[step]          step ∈ problem | solution | combo | script | animation | render
/designs/[id]/algorithm/history         giữ nguyên route, đồng thời mở được dạng ngăn kéo
```

Workflow thực tế **không đi qua stage `assets`** (`approveAlgorithmStage` chuyển combo → script → animation → render; asset được gắn ngay trong bước Kịch bản), nên stepper có 6 bước và "Asset" là một khối trong bước Kịch bản. `STEPS` là một mảng cấu hình duy nhất (`src/lib/algorithm/steps.ts`): `{ key, label, requires, accepted, active }`. Stepper, redirect và guard đều đọc từ mảng này. **Bước Voice của B và khung Preview của C chỉ thêm một mục vào mảng.**

Hàm thuần `deriveStepStates(workflow, revisions, runs, outputs, assetRequests)` trả về trạng thái từng bước:

| Trạng thái | Điều kiện (suy ra từ dữ liệu có sẵn) |
|---|---|
| `locked` | bước phụ thuộc chưa có `accepted*Id` |
| `todo` | mở khóa, chưa có revision |
| `running` | revision `generating`, hoặc run `queued`/`running`, hoặc output/asset đang `generating` |
| `review` | revision `pending_review` (hoặc asset `pending_review`, output `pending_review`) |
| `done` | có `accepted*Id` khớp revision hiện hành |
| `failed` | revision hoặc run `failed` |
| `stale` | revision `stale` hoặc run `stale` |

Bảng ánh xạ chính xác từng bước nằm trong plan (đã đối chiếu `pipeline.ts`); hàm này **chỉ đọc**, không thay đổi quy tắc nghiệp vụ.

Giao diện:

- **Stepper ngang** cố định đầu workspace, mỗi chấm có biểu tượng và `Badge` theo trạng thái. Bước `locked` không bấm được, tooltip nêu lý do ("cần duyệt Combo trước"). Bước khác bấm được để xem.
- **Khung bước** gồm tiêu đề, `Badge` trạng thái, `JobStatusBar` (4.4) khi `running`, nội dung (tái dùng các component `ProblemEditor`, `ComboStage`, `ScriptStage`, `AnimationStage`… tách khỏi trang dài), và dải **"Việc tiếp theo"** với một nút chính duy nhất cùng lý do.
- Bước `done` xem lại được; nút "Sửa" mở hộp thoại xác nhận nêu rõ các bước sau sẽ thành `stale` (theo quy tắc đã có ở `pipeline.ts`/`revision.ts`, UI không tự thêm quy tắc).
- **Lịch sử revision** mở bằng `Sheet` từ thanh đầu trang, nội dung tái dùng phần `<details>` hiện có; route `history` giữ nguyên.
- Mọi server action, `concurrencyVersion`, input ẩn giữ nguyên. Component bước nhận props như hiện nay; thay đổi chỉ ở bố cục và lớp phản hồi.

### 4.3 Phản hồi hành động

- Hook `useActionFeedback(action, { pending, success, queued })` bọc `useActionState<FormState, FormData>`:
  - trả `[state, formAction, isPending]` như cũ;
  - **tự gọi `router.refresh()` khi thành công**, vì hầu hết server action hiện không gọi `revalidatePath` (đã kiểm tra `src/app/algorithm/actions.ts`), nên giao diện chỉ cập nhật nhờ `AutoRefresh`; hook bắn toast bên trong hàm bọc action để không mất toast nếu component bị gỡ sau khi dữ liệu mới về;
  - khi `state` đổi (mỗi lần action trả về một object mới) bắn toast: `state.error` thì `toast.error`, ngược lại `toast.success(success)`; nếu action đẩy job thì nội dung nêu "đã vào hàng đợi" và gắn nút "Xem tiến trình" cuộn tới `JobStatusBar`;
  - `pending` hiển thị qua `ActionButton`.
- `ActionButton`: dựa trên `Button`, nhận `pending`; khi chờ hiện `Loader2` xoay và nhãn đang gửi, `aria-busy`, khóa bấm đúp; khi xong trả lại nhãn gốc. Dùng trong `<form>` hiện có, không đổi cách gửi dữ liệu.
- Lỗi hiện **cả** toast (có thể bị bỏ lỡ) **và** thông báo cạnh nút (giữ lại, ổn định).
- Toàn bộ nút hành động của các stage bài giảng chuyển sang `ActionButton` (khoảng 15 nút); form tạo design, project, series dùng chung hook khi sửa tới.

### 4.4 Trạng thái job trực tiếp

- **Endpoint chỉ đọc** `GET /api/designs/[id]/activity` (JSON, `dynamic = "force-dynamic"`): trả về cho từng run đang mở: `stage`, `status`, `attempts`, `startedAt`, `updatedAt`, `error` (qua `job_runs` và `algorithm_generation_runs`), cộng trạng thái output render và asset request. Không có trường nhạy cảm; app vốn không có đăng nhập (quyết định 2026-10-21) nên không thêm lớp bảo vệ mới.
- `ActivityProvider` (client) bao workspace, polling endpoint trên: **2 giây khi có run đang `queued`/`running`, 10 giây khi rảnh**, tạm dừng khi tab ẩn (`document.visibilityState`), dừng khi unmount. Khi một run **chuyển trạng thái** (running → waiting_review/succeeded/failed) mới gọi `router.refresh()` để nạp dữ liệu máy chủ, thay vì làm mới cả trang mỗi 3 giây. Thay các `AutoRefresh` trong trang bài giảng.
- `JobStatusBar`: dùng dữ liệu của provider; hiển thị "Xếp hàng", "Đang chạy (mm:ss)", "Thử lại lần n/3", "Lỗi" kèm thông điệp rút gọn (đầy đủ trong tooltip), thanh `Progress` không xác định (indeterminate) vì job chưa báo phần trăm. Phân biệt rõ lỗi hạ tầng và nội dung bị từ chối như spec nghiệp vụ §4.

### 4.5 Hộp thông báo toàn cục

- Endpoint chỉ đọc `GET /api/activity?since=<iso>`: các run/output của mọi design bài giảng cập nhật trong 24 giờ gần nhất, mỗi mục có `designId`, tiêu đề design, bước, sự kiện (xong, lỗi, chờ duyệt) và thời điểm.
- `NotificationBell` polling 15 giây (tạm dừng khi tab ẩn). **Số chưa đọc** tính từ mốc `lastSeen` lưu `localStorage` (bọc `try/catch`, mặc định coi như đã đọc nếu không có); mở bảng thì cập nhật mốc. Mỗi mục là liên kết tới đúng bước của design.
- Không thêm bảng thông báo vào DB: nguồn sự thật vẫn là run và output. Hệ quả chấp nhận: thông báo chỉ sống trong 24 giờ và "đã đọc" là theo trình duyệt.

## 5. Phụ thuộc và cấu hình

- Thêm bằng `npx shadcn@latest add sonner sheet tooltip tabs badge progress skeleton separator`: phụ thuộc mới `sonner`, `next-themes` (và `cn`, đã có). Ghim phiên bản đúng như lockfile sau khi cài; xác nhận không đổi phiên bản `next`, `react`, `remotion`.
- Không thêm biến môi trường.
- Không đổi Dockerfile; `npm run lint && npm run build` trong stage `builder` phải qua.

## 6. Xử lý lỗi và biên

- Endpoint activity lỗi hoặc DB tạm thời không truy cập được: provider giữ trạng thái cũ, hiện chấm vàng "mất kết nối", thử lại với backoff tới 30 giây; không bắn toast liên tục.
- `localStorage` bị chặn hoặc ném lỗi: chuông vẫn hoạt động, chỉ không nhớ mốc đã đọc.
- Hai tab cùng mở một design: `concurrencyVersion` đã chặn ghi chồng ở server; UI hiển thị lỗi của action qua toast.
- Server action ném `redirect` (ví dụ tạo design): hook không được nuốt lỗi có `digest` (giống `createAlgorithmDesign` hiện nay).
- Bước `locked` truy cập trực tiếp bằng URL: trang render khung với thông báo và liên kết về bước cần làm; không gọi action.
- Trang phải dùng được ở bề rộng 360 px: stepper cuộn ngang, nội dung một cột.

## 7. Kiểm chứng

Theo AGENTS.md luật 4-6: **không viết, không chạy test**. Dùng `npm run lint`, `npx tsc --noEmit`, `npm run build`, rồi xem trực tiếp bằng trình duyệt trên `npm run dev` (cổng 3000 có thể bị chiếm, kiểm tra trước) với design bài giảng có sẵn: đi qua từng bước, kích hoạt một job để thấy toast, nút chờ, thanh job, chuông; thử ở 360 px và chế độ tối. Báo cáo ghi rõ điều gì đã xem thực tế và điều gì chưa.

## 8. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| `deriveStepStates` lệch quy tắc nghiệp vụ trong `pipeline.ts` | Hàm chỉ đọc, đọc `pipeline.ts`/`revision.ts` khi viết plan; không lặp lại quy tắc ngoài bảng §4.2 |
| Tách trang dài làm hỏng props các stage | Giữ nguyên chữ ký props; chuyển từng bước một, build sau mỗi bước |
| Polling tăng tải DB | Truy vấn có chỉ mục (`algorithm_generation_runs_status`, `job_runs_status`), chỉ chạy khi tab hiện, 2 giây chỉ khi có run đang mở |
| `next-themes` thay đổi giao diện tối ngoài ý muốn | `defaultTheme="system"`; chỉ dùng biến sẵn có trong `globals.css` |
| API `sonner` 2.x khác trí nhớ | Plan bắt buộc tra lại tài liệu chính thức và đọc file `sonner.tsx` sinh ra trước khi viết hook |

## 9. Còn cần chốt trong plan

- Cách tách `page.tsx` hiện tại thành các trang bước mà không lặp truy vấn `getAlgorithmWorkflow` (dùng chung qua layout hay hàm cache).
- Hình dạng JSON chính xác của hai endpoint và truy vấn SQL.
- Thứ tự thực hiện thành các commit nhỏ đúng scope (primitive, khung chung, hook phản hồi, endpoint, workspace, dọn tts-tester).
