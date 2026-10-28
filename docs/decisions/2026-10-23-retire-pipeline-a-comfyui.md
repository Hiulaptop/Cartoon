# Dừng Pipeline A / ComfyUI

Ngày2026-10-23, user quyết định deprecate hướng ComfyUI, đóng branch thử nghiệm và tiếp tục nghiên cứu Remotion. Không tiếp tục các approval/plan Pipeline A cũ hoặc tự mở chu kỳ render mới.

## Lý do và phạm vi

Laptop RTX3050Ti4GB đã thực hiện I2V thật với Wan2.2 TI2V5B, nhưng các clip không đạt chất lượng video hoạt hình mong muốn. Giải mã theo ô giảm áp lực bộ nhớ và loại mảng xanh lớn; đối chiếu FP32 và cửa sổ thời gian lớn hơn vẫn không giải quyết hết lỗi mặt/nhân vật. Đây là kết quả của cấu hình đã thử, không phải kết luận mọi workflow ComfyUI đều không phù hợp.

Không có schema/migration, DB type hoặc tích hợp UI/worker Pipeline A nào được áp dụng. Pipeline gốc dùng Remotion vẫn là hướng hiện tại. Các thay đổi Docker/Supabase local, asset/config/prompt do user cung cấp và knowledge graph chung được giữ nguyên; ESLint vẫn bỏ qua các thư mục scratch/graph sinh tự động.

## Đóng branch và archive

- Branch thử nghiệm được đổi tên thành `archive/pipeline-a-i2v`; không merge hoặc push.
- Đã quay về `build/local-supabase` để tiếp tục từ phần local hiện có.
- Bảy file riêng của thử nghiệm (spec/plan, bốn báo cáo, preflight script) được lưu bằng stash có pathspec tường minh. Tag bền vững `archive/pipeline-a-i2v-2026-10-23` giữ stash commit `e72ca5dad9528f604e23f3e194ad9b510cafdb2b` cùng các parent chứa file untracked; branch archive tự nó vẫn ở base commit, không phải bản snapshot các file này.
- Các tài liệu trong snapshot đã được đánh dấu **DEPRECATED / CLOSED**. Không tạo commit tính năng mới, không stage/commit các thay đổi Docker local đang có.

Khi user chủ động yêu cầu phục hồi để tham khảo, áp snapshot này trên branch/worktree riêng bằng `git stash apply refs/tags/archive/pipeline-a-i2v-2026-10-23`. Không tự apply lên nhánh đang nghiên cứu Remotion. Tag giữ dữ liệu ngay cả khi vị trí `stash@{0}` thay đổi; không xóa tag/stash archive khi chưa được yêu cầu.

Nguồn cú pháp archive: [Git stash](https://git-scm.com/docs/git-stash), [Git branch](https://git-scm.com/docs/git-branch).

## Runtime được giữ lại

ComfyUI/venv/model/workflow/latent/clip và báo cáo thô vẫn ở `data/pipeline-a/` trên ổ D, được gitignore. Ledger/log/helper của phiên thử ở `.superpowers/sdd/2026-10-22-pipeline-a/`. Không gỡ cài đặt hoặc xóa các file dung lượng lớn khi user chỉ yêu cầu deprecate/đóng branch. Tại thời điểm đóng, không có tiến trình Python/ComfyUI còn chạy; không tạo autostart/service/schedule.

Đóng thử nghiệm không đồng nghĩa đã đạt gate laptop hoặc đã xác minh PC AMD. Gate cũ bị hủy cùng hướng triển khai này; không dùng nó để cản trở nghiên cứu Remotion tiếp theo. Kế hoạch Remotion mới sẽ được làm riêng khi user yêu cầu.
