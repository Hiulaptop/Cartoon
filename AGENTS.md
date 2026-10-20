# AGENTS.md

Luật cứng cho mọi coding agent làm việc trong repo này. Không có ngoại lệ, trừ khi user cho phép rõ ràng trong chat cho đúng hành động đó.

## Quy tắc cứng

1. **Mọi kiến thức có sẵn của agent đều coi là sai cho tới khi được xác nhận.** Trước khi viết code, đề xuất cấu hình hoặc trả lời về API/CLI/phiên bản của bất kỳ thư viện nào (Next.js, React, Tailwind, shadcn/ui, Supabase, Docker image, ...), phải tra và đối chiếu với nguồn chính thống trên internet: tài liệu chính thức, changelog, repo chính thức. Dùng context7 trước, rồi WebSearch/WebFetch tới trang chính thức nếu context7 thiếu hoặc mâu thuẫn. Khi báo cáo, nêu nguồn đã dùng. Repo này dùng các phiên bản rất mới (shadcn 4, Tailwind 4, Next 15.5, Supabase publishable key) nên trí nhớ của model thường lỗi thời.
2. **Luôn cung cấp thông tin về repo hiện tại và phiên bản đang dùng** khi đề xuất thay đổi: đọc `package.json`/lockfile/`Dockerfile` thực tế chứ không đoán (bảng phiên bản trong `CLAUDE.md` có thể đã cũ, phải kiểm tra lại).
3. **Thay đổi lớn, đặc biệt mọi thứ liên quan đến schema, phải đi theo spec-driven và được user approve trước khi làm.** "Liên quan đến schema" gồm: bảng/cột/index/RLS/migration của Supabase, type sinh ra từ DB, và hợp đồng dữ liệu giữa client, server và 9router. Quy trình: dùng `superpowers:brainstorming` để làm rõ yêu cầu, viết spec (và plan bằng `superpowers:writing-plans`), trình bày cho user, **chờ user approve rõ ràng trong chat**, rồi mới thực hiện. Không tự suy ra "approve" từ việc user im lặng hay từ thông báo tự động.

## Quy tắc về test

4. **Tuyệt đối không tự viết test.** Không tạo hay sửa file test dưới bất kỳ dạng nào (`*.test.*`, `*.spec.*`, thư mục `__tests__`, file test e2e, fixture/mock dành riêng cho test), kể cả khi vừa viết xong tính năng, vừa sửa lỗi, hoặc "để cho chắc". Chỉ viết test khi user yêu cầu rõ ràng bằng lời.
5. **Khi được yêu cầu viết test, phải plan và được duyệt trước.** Plan trình bày cho user gồm: phạm vi (test cái gì, không test cái gì), danh sách kịch bản cụ thể (luồng chính, trường hợp biên, lỗi, quyền truy cập/RLS nếu liên quan), dữ liệu test, những gì mock/stub, công cụ test (đã xác nhận phiên bản và cách dùng với nguồn chính thống theo luật 1), vị trí và tên file. **Chờ user approve rõ ràng trong chat** rồi mới viết đúng theo plan đã duyệt; muốn thêm kịch bản ngoài plan phải xin lại.
6. **Tuyệt đối không tự chạy các file `*.test.*` (và `*.spec.*`)**, kể cả test có sẵn, kể cả sau khi vừa viết xong, kể cả để xác minh thay đổi. Chỉ chạy khi user ra lệnh chạy rõ ràng trong chat cho lần đó; lệnh cho lần này không áp dụng cho các lần sau.
   - Lint (`npm run lint`), kiểm tra kiểu (`npx tsc --noEmit`) và build (`npm run build`, `docker compose build`) không phải test và vẫn được chạy để xác minh thay đổi.

## Quy tắc về commit

7. **Mỗi commit phải đúng scope, cô đọng và theo Conventional Commits** (https://www.conventionalcommits.org/en/v1.0.0/).
   - **Phạm vi staging:** một commit = một thay đổi logic trọn vẹn, gồm đúng những file cùng phục vụ thay đổi đó. Không quá ít (không tách một thay đổi thành các commit không thể build hoặc không có nghĩa riêng), không quá nhiều (không gộp việc không liên quan). Thấy đang gộp nhiều việc thì tách thành nhiều commit.
   - **Chọn file tường minh:** `git add` từng file hoặc từng hunk; không dùng `git add -A`, `git add .` hay `git commit -a`. Trước khi commit phải xem `git status`/`git diff --staged` và chắc chắn không lẫn file ngoài scope, `.env` hay file sinh tự động.
   - **Định dạng message:** `<type>[(scope)][!]: <description>`, rồi thân và footer (nếu có) cách nhau một dòng trống. `type` dùng `feat` cho tính năng và `fix` cho sửa lỗi (hai loại này bắt buộc theo spec); các loại khác được dùng: `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`. `scope` là danh từ chỉ phần code bị ảnh hưởng, ví dụ `feat(auth):`, `build(docker):`. Thay đổi phá vỡ tương thích thì thêm `!` trước dấu hai chấm hoặc footer `BREAKING CHANGE: ...`.
   - **Cô đọng:** description ngắn (khoảng 72 ký tự trở xuống), thể mệnh lệnh, viết thường sau dấu hai chấm, không dấu chấm cuối. Chỉ thêm thân khi lý do không hiển nhiên từ diff, tối đa vài dòng; không liệt kê lại file đã sửa, không kể lại diff, không giải thích dài dòng.
   - Dòng attribution cuối commit do hệ thống yêu cầu vẫn giữ nguyên (là footer, không tính là phần giải thích).

## Công cụ bắt buộc sử dụng

- **superpowers**: gọi skill liên quan *trước khi* hành động hoặc hỏi lại (ví dụ `superpowers:brainstorming` cho tính năng mới, `superpowers:systematic-debugging` cho lỗi, `superpowers:verification-before-completion` trước khi báo hoàn thành). Khi skill nào đó hướng dẫn viết hoặc chạy test (ví dụ `superpowers:test-driven-development`), luật 4-6 ở trên vẫn thắng.
- **context7** (MCP `mcp__plugin_context7_context7__resolve-library-id` rồi `query-docs`): dùng cho mọi câu hỏi về thư viện/framework, kể cả loại quen thuộc.
- **understand-anything** (`/understand`, `/understand-chat`, `/understand-diff`, `/understand-dashboard`): dùng để dựng và truy vấn knowledge graph của codebase trước khi khám phá rộng hoặc sửa lớn. Graph chưa được tạo trong repo này; chạy `/understand` lần đầu khi cần.
