# Asset generation dimensions — implementation report

Ngày2026-10-23; nhánh `feat/asset-generation-dimensions`. Theo spec/plan và bổ sung mapping Antigravity được user duyệt trong chat. Không commit/push. Boston smoke tiếp tục PAUSED.

## Thay đổi

- Form tạo asset: Mặc định model hoặc5preset1024×1024,1920×1080,1080×1920,1536×1024,1024×1536. Server và worker validate allowlist; preset lưu bất biến trong asset, base/variant/retry kế thừa DB.
- Antigravity prefixag/antigravity: requested1920x1080→wire1792x1024; requested1080x1920→wire1024x1792. Các preset/provider khác pass-through; default không gửi size. Không đổi endpoint/model/router.
- Đo source width/height từ binary trước key/trim; PNG dimensions giữ nguyên ý nghĩa cũ. UI/metrics phân biệt requested/transport/source/processed, cảnh báo mismatch từ source thay vì ảnh trim.
- Image request HTTP400/422 kết thúc permanent, không tự đổi model/size hoặc lặp request mismatch200. HTTPkhác/mạng giữ retry cũ. Không đưa raw provider error/key vào thông báo lỗi ảnh.
- Không thêm dependency hoặc đổi Scene DSL/Remotion composition/kích thước video.

## Migration local và dữ liệu cũ

`0003_asset_generation_dimensions`:3nullablecolumns (assets.generation_size,asset_variants.source_width/source_height),2checks. Không sửa migration cũ/index/RLS. Backup pg_dump custom trước apply ở `.superpowers/sdd/2026-10-23-asset-generation-dimensions/before.dump`, giữ riêng local; không chứa trong commit.

Đã kiểm target localhost54322, queue rỗng, tạm dừng chỉ Cartoon app/worker khi migration. History3→4; counts trước/sau migration assets6,variants10,series2,videos1 không đổi. Các field mới legacy đềuNULL; không backfill giả. Cả10file cũ giữ đúngSHA256 so với checkpoint. Không migration cloud/reset Supabase hoặc đổi dữ liệu project khác.

## Ba job vận hành thật đã duyệt

Tạo bằng form app thật, queue+Docker worker thật. Series `DIMENSIONS — 2026-10-23`, ID `fde6fd30-ace4-4428-ace0-cea438e6661e`. Không mock/fixture/test suite.

| Job | Requested | Wire | Source | PNG | Kết quả |
|---|---|---|---|---|---|
| prop base `e11d8683-5420-47c9-b74b-959f5eeb4d94` | 1024×1024 | 1024x1024 | 1024×1024 | 818×810 | succeeded,attempt1,mismatch=false |
| bg base `7217a913-55da-4d19-a946-d6a741a5c9df` | 1920×1080 | 1792x1024 | 1376×768 | 1376×768 | succeeded,attempt1,mismatch=true |
| prop broken `aa46072d-c0a9-4de5-a875-4aaccc21e029` | 1024×1024 kế thừa | 1024x1024 | 1024×1024 | 914×887 | succeeded,attempt1,mismatch=false |

Wire được đối chiếu từ serializer source và metrics transportSize của chính generateImage, không capture TLS hoặc log credential/prompt. Không có lượt generation bổ sung/retry ngoài3job; không chạy cố ý upstream400/422.

Asset prop `98480094-5e8b-458f-9b3f-579024e61bd7`: agent xem base PNG, xác nhận cutout có alpha thật bằng Sharp stats, duyệt qua form gốc để tạo broken; review reason ghi rõ agent provenance, không giả user artistic approval. Broken giữ pending_review. Background `98cdfadf-b198-4f94-8725-d79e0610537e` giữ pending_review.

Agent đã xem background thật: nền cảng tách riêng, không nhân vật/thùng, nhưng horizon khoảng0.62 thay0.40 yêu cầu. **1376×768 không phải16:9 chính xác**, cũng không phải native1920×1080. Không crop/pad/resize/approve để vượt gate lab; tính năng gửi yêu cầu hoạt động, độ tuân thủ tỷ lệ/pixel của provider vẫn có giới hạn. Không resume Boston smoke hoặc render MP4.

## Kiểm chứng UI và build

- Lint/typecheck thành công; Docker app+worker build thành công, app healthy và worker chạy cùng schema mới. Log nằm trong ledger directory.
- Form đã hiện đủ preset; dữ liệu sai mô tả bị server chặn, không sinh job. Kiểm tra giữ lựa chọn phát hiện native action reset; controlled value không đủ. Bản build cuối đã sửa bằng cách đồng bộ option.defaultSelected khi chọn: submit mô tả1ký tự trả lỗi và vẫn giữ1920x1080. Preset bất hợp lệ900x900 bị server chặn trước enqueue; tổng số job verification vẫn đúng3.
- Asset page prop hiển thị nguồn1024×1024 và PNG818×810 không cảnh báo nhầm do trim. Background page hiển thị nguồn/PNG1376×768 và warning so1920×1080; image naturalWidth/Height khớp1376×768.
- Asset Puno legacy mở được, preset Mặc định model và source “Chưa ghi nhận”, hai ảnh cũ vẫn hiển thị; không đổi approval/source cũ.
- Animation Lab mở được và đọc catalog3series sau migration; không render video hoặc khẳng định positive Remotion export mới đã qua, vì thiếu background đúng16:9 approved vẫn là prerequisite riêng.
- T3 snapshot/click automation timeout; CUA báo không có browser. T3DOM evaluate/type/select vẫn hoạt động, nên kiểm qua DOM và form.requestSubmit thật; không tuyên bố screenshot hoặc layout visual QA đã qua.
- Không tạo/sửa/chạy formal test files. Các trường hợp HTTP400/422, provider khác và5preset đầy đủ chưa gọi upstream để đo; không tuyên bố mọi model/preset đều được xác minh.

Nguồn API: [React controlled select](https://react.dev/reference/react-dom/components/select), [option.defaultSelected](https://developer.mozilla.org/en-US/docs/Web/API/HTMLOptionElement/defaultSelected), [Sharp0.35.5 metadata](https://github.com/lovell/sharp/blob/v0.35.5/docs/src/content/docs/api-input.md), [Drizzle migrations](https://orm.drizzle.team/docs/migrations), [provider source investigation](IMAGE_PROVIDER_DIMENSION_INVESTIGATION.md).

Fresh reviewer trước manual form fix không tìm thấy Critical/Important/Minor; fix UI sau đó được kiểm trực tiếp bằng manual flow/build theo ledger. Không dùng review thay thế kết quả generation thật.
