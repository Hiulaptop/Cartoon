# Chuẩn đặt tên asset

Asset thuộc về đúng một bộ phim; tham chiếu `@...` trong kịch bản/cảnh luôn hiểu theo bộ phim của bản thiết kế.

Áp dụng cho mọi asset trong DB, cho LLM viết kịch bản/phân cảnh, cho LLM validate và cho người duyệt. Tài liệu này là nguồn duy nhất; thay đổi quy ước phải sửa file này (và được duyệt như thay đổi schema).

## Cấu trúc

- Asset: `<loại>_<tên>`, ví dụ `chr_minh`.
- Biến thể (một ảnh cụ thể của asset): `<loại>_<tên>.<trạng thái>`, ví dụ `chr_minh.happy`.

| Loại | Tiền tố | Ý nghĩa |
|---|---|---|
| Nhân vật | `chr_` | Nhân vật có thể nói, đổi biểu cảm |
| Bối cảnh | `bg_` | Nền phía sau cảnh (16:9) |
| Đạo cụ | `prop_` | Vật thể đặt trong cảnh |
| Hiệu ứng | `fx_` | Hiệu ứng hình ảnh (vụ nổ, ngôi sao, ...) |

## Luật

1. **Ký tự:** chữ thường ASCII `a-z`, số `0-9` và `_`. Không dấu tiếng Việt, không khoảng trắng, không `-`.
   - Asset: `^(chr|bg|prop|fx)_[a-z0-9]+(_[a-z0-9]+)*$`
   - Trạng thái: `^[a-z0-9]+(_[a-z0-9]+)*$`
   - Tên asset (cả tiền tố) dài tối đa 40 ký tự.
2. **Tên hiển thị** (có dấu, viết hoa, ví dụ "Minh") lưu ở cột `display_name`, không nằm trong tên.
3. **Duy nhất trong từng bộ phim** (cặp `series_id` + tên); hai bộ phim có thể cùng có `chr_minh`.
4. **Bất biến sau khi duyệt.** Muốn đổi tên thì thêm bí danh vào `aliases`; tên cũ vẫn phân giải được để kịch bản cũ không hỏng.
5. **Trạng thái chỉ lấy từ danh sách cho phép** của loại tương ứng (bên dưới). LLM không được tự đặt trạng thái mới. Thêm trạng thái = sửa danh sách trong file này.

## Trạng thái cho phép (khởi điểm)

| Loại | Trạng thái |
|---|---|
| `chr` | `base`, `idle`, `talk_a`, `talk_b`, `happy`, `sad`, `angry`, `surprised`, `walk` |
| `bg` | `base`, `day`, `night`, `rain` |
| `prop` | `base`, `broken` |
| `fx` | `base` |

`base` là ảnh gốc đã duyệt, dùng làm ảnh tham chiếu khi sinh các biến thể khác.

## Cách tham chiếu trong kịch bản và phân cảnh

- Viết `@` + tên: `@chr_minh.happy`, `@bg_lop_hoc.night`.
- Không ghi trạng thái (`@chr_minh`) nghĩa là `idle` với `chr`, và `base` với các loại khác.
- Validate lớp 1 kiểm tra mọi tham chiếu `@...`: tồn tại, đã duyệt, trạng thái nằm trong danh sách và đã có ảnh được duyệt. Thiếu thì cảnh bị chặn hoặc tạo yêu cầu sinh asset để người duyệt xem.

## Ví dụ

| Hợp lệ | Không hợp lệ | Lý do |
|---|---|---|
| `chr_minh` | `chr_Minh` | Chữ hoa |
| `bg_lop_hoc` | `bg_lớp_học` | Có dấu |
| `prop_xe_dap.broken` | `prop_xe-dap` | Dấu `-` |
| `chr_minh.talk_a` | `chr_minh.laughing` | Trạng thái ngoài danh sách |
| `fx_vu_no` | `vu_no` | Thiếu tiền tố loại |
