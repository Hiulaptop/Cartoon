# Ghi chú: định dạng và cấu trúc prompt (tạm gác, xem lại sau)

- Ngày tra: 2026-10-21. Trạng thái: **chưa áp dụng** vào code.
- Phạm vi: 4 prompt LLM của repo: `src/lib/assets/prompts.ts`, `src/lib/script/prompts.ts`, `src/lib/scene/prompts.ts`, `src/lib/judge/prompts.ts`.

## Điểm chung của 3 nhà cung cấp

1. Chia prompt thành các phần rõ ràng: **vai trò → quy tắc → ví dụ → dữ liệu/ngữ cảnh**, phân cách bằng thẻ XML hoặc tiêu đề Markdown, và chỉ dùng **một** kiểu.
2. Dữ liệu dài đặt **trước**, yêu cầu/câu hỏi đặt **cuối**.
3. Có **ví dụ mẫu** (3–5 ví dụ; đa dạng; cùng một định dạng).
4. Nói rõ định dạng đầu ra; nói điều **nên làm** hơn điều cấm; kèm **lý do** của quy tắc.
5. Model mới: viết bình thường, bỏ kiểu hô hào "CRITICAL / MUST".

## Nguồn

| Nguồn | Ý chính |
|---|---|
| [OpenAI: Prompt engineering](https://developers.openai.com/api/docs/guides/prompt-engineering) | Developer message gồm Identity, Instructions, Examples, Context (context gần cuối). Model suy luận chỉ cần chỉ dẫn mức cao; model GPT thường cần chỉ dẫn chi tiết. |
| [OpenAI: Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) | `json_schema` + `strict` bảo đảm đúng schema; JSON mode chỉ bảo đảm JSON hợp lệ. |
| [Anthropic: Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | Thẻ XML, 3–5 ví dụ trong `<example>`, vai trò trong system prompt, giải thích lý do. Dữ liệu 20k+ token đặt trên, câu hỏi ở cuối (trang ghi cải thiện tới 30%). Phong cách prompt ảnh hưởng phong cách câu trả lời. Bỏ hô hào và bỏ prefill. |
| [Google: Gemini prompting strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies) | Luôn có ví dụ, vừa đủ. Gemini 3: ràng buộc và định dạng đặt ở đầu hoặc trong system instruction; ngữ cảnh trước, câu hỏi cuối; **không yêu cầu in lập luận** (model tự suy nghĩ bên trong); để tham số lấy mẫu ở mặc định. |
| [He et al. 2024, arXiv 2411.10541](https://arxiv.org/abs/2411.10541) | Cùng nội dung, khác định dạng (văn thường, Markdown, JSON, YAML): GPT-3.5 chênh tới 40%, GPT-4 ổn định hơn. Chỉ thử trên model OpenAI. |
| [Tam et al. 2024, arXiv 2408.02442 (EMNLP)](https://arxiv.org/abs/2408.02442) | Ép đầu ra theo khuôn làm giảm khả năng suy luận; khuôn càng chặt càng giảm. Cách đỡ hơn: trả lời tự do rồi chuyển sang JSON. |
| [Liu et al. 2023, arXiv 2307.03172 (TACL)](https://arxiv.org/abs/2307.03172) | "Lost in the Middle": thông tin ở đầu và cuối ngữ cảnh được dùng tốt nhất. |

Ghi chú: số liệu của hai bài 2411.10541 và 2408.02442 lấy qua kết quả tìm kiếm và bản tóm tắt, chưa đọc PDF.

## Đề xuất cho repo (chưa làm)

| # | Việc | Ghi chú |
|---|---|---|
| 1 | Chia system prompt thành phần (vai trò / quy tắc / ví dụ) bằng thẻ XML, một kiểu thống nhất | Cả 4 prompt hiện là một chuỗi gạch đầu dòng dài |
| 2 | Thêm 1–3 ví dụ ngắn: một nhịp kịch bản, một cảnh JSON hợp lệ | Hiện không có ví dụ nào |
| 3 | Thêm lý do ngắn cho quy tắc, ví dụ "≤ 84 ký tự vì phụ đề 2 × 42 ký tự" | |
| 4 | Dữ liệu (danh mục asset, kế hoạch cảnh, JSON Schema) đặt trước, yêu cầu chính ở cuối | Đã gần đúng hướng |
| 5 | Kiểm tra 9router có hỗ trợ `response_format: json_schema` không; có thì dùng | Nếu không: bỏ khóa `$schema` khỏi schema trước khi dán (model từng chép khóa này, xem `src/worker/scene-graph.ts`) |
| 6 | Giám khảo (G-Eval): rút gọn trường `reasoning`, hoặc tách thành bước chấm tự do rồi chuyển sang JSON | Theo Tam et al. và hướng dẫn Gemini 3 |
| 7 | Bỏ chữ hoa hô hào ("ONLY", "EXACTLY", "HARD BLOCKS") trừ chỗ thật cần | |
| 8 | Cân nhắc để nhiệt độ mặc định với Gemini 3 | Cần đo trước khi đổi |

**Trước khi áp dụng:** cần cách đo hiệu quả (ví dụ so tỉ lệ đạt lớp 1, điểm giám khảo, số vòng sửa trên cùng một bộ kịch bản). Theo AGENTS.md, đo/test chỉ làm khi user yêu cầu và duyệt plan.
