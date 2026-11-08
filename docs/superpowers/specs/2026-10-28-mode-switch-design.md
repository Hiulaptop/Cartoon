# Công tắc chế độ Cartoon | Giảng bài (UI)

Ngày: 2026-10-28. Trạng thái: chờ user duyệt. Không đổi schema, không đổi hợp đồng dữ liệu.

## 1. Mục tiêu

Tách giao diện của hai loại video (`videos.kind`: `cartoon`, `algorithm`) bằng một công tắc ở topbar. Chọn chế độ nào thì trang chủ, cây Project, tạo design và sidebar chỉ hiện nội dung của loại đó. Bộ phim/asset, thư mục Project và Jobs vẫn dùng chung.

Không làm: đổi route, đổi schema, lọc Jobs, lưu chế độ theo tài khoản (app không có đăng nhập).

## 2. Nguyên tắc state (phần quan trọng nhất)

Chế độ là **một giá trị duy nhất, nằm ở server (cookie)**. Mọi nơi khác chỉ đọc hoặc suy ra từ nó, không giữ bản sao.

| Nguyên tắc | Nội dung |
|---|---|
| S1. Một nguồn sự thật | Cookie `mode`. Không `useState`/`localStorage`/context nào giữ bản sao lâu dài. |
| S2. Chỉ dùng để hiển thị | Cookie quyết định **cái gì được hiện**. Mutation (server action) và worker **không bao giờ đọc cookie**: loại video lấy từ dữ liệu tường minh (trường form `kind`, bản ghi `videos.kind`). |
| S3. Luôn hợp lệ | `parseMode(raw)` trả `"cartoon"` khi thiếu hoặc sai giá trị. Server action kiểm đầu vào bằng allowlist, không tin client. |
| S4. Design thắng cookie | Ở `/designs/[id]`, chế độ hiệu lực là `video.kind` của design đó, không phải cookie. |
| S5. Không số liệu giả | Mọi con số/trạng thái "trống" liên quan an toàn xoá (thư mục trống, số design) tính trên cây **chưa lọc**. |

Từ vựng: `Mode = VideoKind` (`"cartoon" | "algorithm"`), dùng lại type có sẵn ở `src/lib/video/kind.ts`. Nhãn ngắn trên tab: "Cartoon", "Giảng bài".

## 3. Đọc và ghi chế độ

**Đọc (server):** `getMode()` trong `src/lib/mode-server.ts`: `parseMode((await cookies()).get("mode")?.value)`, bọc `React.cache` để mỗi request đọc một lần. Hằng số, type và `parseMode` (thuần, an toàn cho client) nằm riêng ở `src/lib/mode.ts`. Root layout gọi `getMode()` rồi truyền `mode` xuống `AppSidebar` và `AppTopbar` bằng props; trang chủ, trang Project, new-design tự gọi `getMode()`.

**Ghi:** server action `setMode(mode, redirectTo?)` ở `src/app/mode-actions.ts`:
1. Kiểm `mode` bằng allowlist; sai thì trả lỗi, không ghi gì.
2. `cookies().set("mode", mode, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 1 năm })`. Không đặt `secure` vì app chạy cả `http://127.0.0.1` lẫn HTTPS qua tunnel; cookie chỉ là tuỳ chọn hiển thị, không nhạy cảm.
3. Nếu `redirectTo` thuộc allowlist `["/"]` thì `redirect(redirectTo)`.

Theo tài liệu Next.js, ghi cookie trong Server Action làm server render lại trang hiện tại cùng layout trong chính response đó (nguồn: nextjs.org/docs/app/getting-started/mutating-data, api-reference/functions/cookies). Next.js 15.5 là bản repo đang dùng; tài liệu cũng nhắc `refresh`/`updateTag`, đó là API của bản mới hơn nên **không dùng**. Để chắc chắn, action gọi thêm `revalidatePath("/", "layout")` trước `redirect`.

## 4. Thành phần UI và state cục bộ

**`ModeSwitch`** (client, trong `app-topbar.tsx`):
- Nhận `mode` từ props (nguồn thật), giữ `useOptimistic(mode)` để tab sáng ngay khi bấm; `useTransition` bọc lời gọi action.
- Thất bại thì giá trị optimistic tự trả về `mode` thật, kèm toast lỗi (sonner có sẵn).
- Bấm nhanh A→B→A: Server Action chạy tuần tự, kết quả cuối thắng, optimistic theo lần bấm cuối.
- **Bấm cả tab đang sáng vẫn gọi action** (idempotent, rẻ). Lý do: khi Back/Forward hiện lại snapshot cũ, `mode` trong props có thể lệch cookie; bấm lại là cách người dùng tự đồng bộ.
- Nếu đang ở `/designs/*` (kiểm bằng `usePathname`) thì truyền `redirectTo: "/"`. Nếu không chuyển trang thì `ModeSync` (mục dưới) sẽ ép chế độ trở lại theo design, làm công tắc "không ăn".

**`ModeSync`** (client, render rỗng, đặt trong `src/app/designs/[id]/layout.tsx`):
- Layout design biết `video.kind` và `getMode()`. Chỉ render `<ModeSync kind=... />` khi hai giá trị lệch nhau.
- `useEffect` gọi `setMode(kind)` một lần cho mỗi cặp `(designId, kind)`, có `useRef` chặn gọi lại để không lặp vô hạn nếu cookie bị trình duyệt từ chối. Lỗi thì toast, không thử lại.
- Đánh đổi đã chấp nhận: tab trên topbar có thể hiện chế độ cũ trong một nhịp (một vòng request) khi mở thẳng design của loại kia. Không dùng redirect ở layout vì prefetch của `<Link>` và redirect sang route handler cho hành vi không đoán trước.

**Sidebar** nhận `mode` qua props (không context), cập nhật khi response của action về.

## 5. Lọc theo chế độ

| Khu | Thay đổi |
|---|---|
| Trang chủ `/` | Danh sách "gần đây" lọc `videos.kind = mode`. Cartoon: giữ khối giám khảo và quy trình 7 bước (`PIPELINE_STEPS`). Giảng bài: bỏ khối giám khảo, quy trình 7 bước lấy từ `STEPS` (`src/lib/algorithm/steps.ts`). Khối Hệ thống, Kiểm tra nhanh, Bộ phim giữ chung. |
| Cây Project | `loadTree()` giữ nguyên (chưa lọc). Thêm hàm thuần `filterTreeByKind(roots, kind)` ở `src/lib/project/tree.ts`, trả bản sao có `designs` đã lọc, giữ nguyên thư mục. Chỉ dùng cho **hiển thị**. |
| `/projects/[id]` | Hiện danh sách đã lọc. Nếu thư mục có design nhưng toàn loại kia: thay "Thư mục trống" bằng "Chưa có design <loại> (còn N design <loại kia>)" (S5). Cài đặt/Xoá project dùng cây chưa lọc. |
| Tạo design | `new-design/page.tsx` truyền `kind = mode` cho `CreateVideoForm`. Form bỏ ô chọn loại, khởi tạo `seriesId` bằng `pickSeries(...)` ngay trong `useState` (thay vì trong `onChange`). Giữ các input ẩn `kind`/`seriesId` vì React 19 gọi `form.reset()` sau action. Muốn tạo loại kia thì đổi chế độ. |
| Sidebar | Mỗi link công cụ có thêm trường `modes`. "Sân thử JSON cảnh": chỉ cartoon. "Thử giọng đọc TTS": chỉ giảng bài. Link khác hiện cả hai. |
| Layout design | Giữ nguyên: cartoon 6 tab, giảng bài vào workspace riêng. |
| Dùng chung, không lọc | Bộ phim và asset, Jobs, chuông thông báo, `ActivityProvider`. |

## 6. Tương tác với state sẵn có

- **`cookies()` làm route động.** Root layout đọc cookie nên mọi route thành dynamic. Chấp nhận được: các trang dùng DB đã `force-dynamic`, `next.config.ts` không đặt `staleTimes` nên Client Router Cache theo mặc định của Next 15, và build không chạm DB.
- **`ActivityProvider`** (polling activity theo design): nằm trong layout design nên bị gỡ khi công tắc chuyển trang đi (`redirect("/")`); cleanup hiện có của `useEffect` dọn timer và listener `visibilitychange`. Khi `ModeSync` chỉ đổi cookie mà vẫn ở lại design, Next giữ nguyên cây React nên polling không bị reset. `router.refresh()` do polling gọi chỉ đọc cookie, không ghi.
- **Nhiều tab trình duyệt** dùng chung cookie. Tab cũ có thể hiển thị chế độ lỗi thời cho đến lần điều hướng/refresh kế tiếp. Vô hại nhờ S2 (hành động dùng `kind` tường minh). Có một trường hợp đua: tab A ở chế độ giảng bài, tab B còn mở design cartoon; điều hướng trong B sẽ làm `ModeSync` đặt lại cookie về cartoon. Chấp nhận, không thêm đồng bộ liên tab.
- **Mất dữ liệu nhập chưa lưu.** Đổi chế độ khi đang ở design sẽ chuyển trang nên bỏ input client chưa gửi (ví dụ nháp ô chat đề bài). Chấp nhận vì mọi dữ liệu có giá trị đã lưu qua server action.
- **Back/Forward** có thể hiện snapshot của chế độ cũ; snapshot tự nhất quán (cả topbar lẫn nội dung cùng cũ). Bấm lại tab chế độ là sửa (mục 4).

## 7. File dự kiến

Thêm: `src/lib/mode.ts`, `src/lib/mode-server.ts`, `src/app/mode-actions.ts`, `src/components/mode-switch.tsx`, `src/components/designs/mode-sync.tsx`.
Sửa: `src/app/layout.tsx`, `src/components/app-topbar.tsx`, `src/components/app-sidebar.tsx`, `src/app/page.tsx`, `src/app/projects/[id]/page.tsx`, `src/app/projects/page.tsx`, `src/components/projects/tree-list.tsx` (nhận cây đã lọc, giữ nguyên giao diện), `src/lib/project/tree.ts` (`filterTreeByKind`), `src/app/projects/[id]/new-design/page.tsx`, `src/components/videos/create-video-form.tsx`, `src/app/designs/[id]/layout.tsx`, và thêm một mục vào `CLAUDE.md`.

## 8. Kiểm chứng

Không viết hay chạy test (AGENTS.md luật 4–6). Xác minh bằng `npx tsc --noEmit`, `npm run lint`, `npm run build`, rồi duyệt tay các tình huống:

1. Lần đầu vào (không cookie): chế độ Cartoon.
2. Bấm Giảng bài ở trang chủ: danh sách và quy trình đổi, F5 vẫn giữ.
3. Mở thẳng link design giảng bài khi đang ở Cartoon: tab chuyển sang Giảng bài, không lặp vô hạn.
4. Đang ở design cartoon, bấm Giảng bài: về trang chủ chế độ Giảng bài, không bị kéo ngược.
5. Thư mục chỉ có design loại kia: thông báo đúng, không ghi "trống".
6. Tạo design ở mỗi chế độ: loại được khoá đúng, tạo thành công.
7. Chặn cookie của trình duyệt: không lặp, có toast, app vẫn dùng được ở chế độ Cartoon.
8. Bấm nhanh qua lại nhiều lần: tab cuối cùng thắng, không nhấp nháy kéo dài.

## 9. Rủi ro còn lại

- Hành vi "ghi cookie trong Server Action tự render lại trang" theo tài liệu mới nhất; phải kiểm trên Next 15.5.28 thật ở tình huống 2 và 4 (và đã có `revalidatePath` dự phòng).
- TTS tester gắn với chế độ Giảng bài là suy đoán; cần user xác nhận nếu cartoon cũng dùng.
