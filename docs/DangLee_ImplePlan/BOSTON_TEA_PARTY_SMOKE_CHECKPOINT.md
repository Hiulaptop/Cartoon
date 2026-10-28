# Boston smoke — checkpoint tạm dừng

Người dùng đã yêu cầu pause ngày2026-10-23 để ưu tiên dimension, rồi **yêu cầu resume rõ ràng với background fill tới viền16:9**. Lượt r2 đã hoàn tất theo amendment cover trong plan: clip30s/1080p30 không thoại, metadata900frame và playback đã kiểm. Xem [smoke report và inventory r2](BOSTON_TEA_PARTY_SMOKE_REPORT.md). Inventory6asset/10file bên dưới là checkpoint lúc pause, không phải inventory cuối r2; giữ nguyên bằng chứng r1.

Sau checkpoint này, tính năng dimension được triển khai/kiểm chứng bằng **series riêng DIMENSIONS**, thêm2asset/3file; xem [dimension report](ASSET_GENERATION_DIMENSIONS_REPORT.md). Không phải smoke Boston được resume, không thay6asset/10file gốc bên dưới. Ảnh ngang thử mới1376×768 vẫn không đạt16:9 chính xác.

## Asset đã có trên local

Đọc trực tiếp DB và hash file ngày 2026-10-23: **6 asset, 10 file biến thể**. `approved` ở đây là trạng thái từng variant, không chỉ trạng thái asset cha. Không đổi approval của bất kỳ ảnh nào.

Series gốc `Rock, Paper, Puno` — `bfa06b9c-1308-4b87-8383-45e63d3a2c85`:

| Asset | Asset ID | Variant và kích thước PNG | Trạng thái variant |
|---|---|---|---|
| `bg_boston_tea_party_dock` | `b01fd5e7-dc31-418e-8297-270b22259a49` | base 1024×1024; day 1024×1024 | base approved; day pending_review |
| `chr_baby_penguin` — Puno | `626d9d8c-afbd-4e48-ba60-be0cf3dfe13e` | base 682×849; talk_a 797×899 | base approved; talk_a pending_review |
| `chr_dock_worker` | `1e505c0b-bd95-4a45-a32b-66798d94d4e6` | base 547×965; angry 569×967 | base approved; angry pending_review |
| `chr_harbor_merchant` | `431bdb73-e0bc-4040-bcdd-0afe1b97e6c4` | base 487×927 | pending_review |
| `prop_boston_tea_barrel` | `9e6ad050-a6ba-427f-af1b-ba8a3cf9f826` | base 748×917; broken 698×862 | cả hai approved |

Series smoke `SMOKE — Puno Boston Tea Party — 2026-10-23` — `33cec9f5-962f-4654-96ef-c4d347a8f687`:

| Asset | Asset ID | Variant và kích thước | Trạng thái |
|---|---|---|---|
| `bg_boston_harbor_far` | `69466165-cdfb-4d16-bcc1-8bc932123b8b` | base 1024×1024 | pending_review, sai tỷ lệ 16:9 |

Mỗi file ở `data/assets/<asset-id>/<state>.png`. `data` của worktree là junction về `D:/Pancake-Utopia/StuDev/Cartoon/data`; không copy lại hoặc xóa nguồn.

Snapshot máy đọc được có đủ variant ID, file path và SHA256 từng file: `.superpowers/sdd/2026-10-23-boston-tea-party-smoke/asset-inventory.json`. Đây là checkpoint local ignored, không chứa credential. Không suy ra source canvas từ PNG đã trim.

## Còn thiếu và cách tiếp tục sau này

- Smoke chỉ tạo mới một background; chưa import Puno vào series smoke.
- Chưa có bộ asset rời mới cho nước, bến, tàu, công nhân tay không + pose angry, thùng gỗ, portal, splash. Asset gốc không mặc nhiên thay thế chúng; cần xem ảnh và đúng phạm vi trước khi dùng.
- Chưa có composition Boston, frame tham chiếu hoặc MP4.
- Job background đã hoàn tất: `bae606af-6da5-4cda-901d-20998e02cd51`; không có job smoke còn chạy cần hủy.
- Manifest runtime giữ bằng chứng kỹ thuật `blocked_background_ratio`, không đổi thành success. Control pause được ghi tại checkpoint/plan/ledger, tách với kết quả lần chạy.
- Khi người dùng resume: đọc checkpoint + manifest + hash, kiểm lại catalog trạng thái thật; cần background 16:9 được duyệt. Không gọi lại lệnh `background` của run r1 hoặc xóa manifest để sinh trùng. Nếu dimension V1 giữ preset bất biến thì background cũ NULL không đổi được preset; lên lượt asset/run mới có chọn preset sau khi scope resume được chốt.
