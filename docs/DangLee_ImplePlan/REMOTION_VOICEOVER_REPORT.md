# Remotion voiceover — implementation report

Ngày: 2026-10-24. Branch hiện hành `feat/asset-generation-dimensions`, worktree `feat-remotion-animation-showcase`; không commit/push. Spec và implementation plan đã được user duyệt riêng.

**Trạng thái: đã triển khai; chưa nghiệm thu audio end-to-end.** Không tạo TTS take, không upload bản thu, không tự duyệt audio/timeline và không render video trong lượt implementation này.

## Đã thêm

- Tab Lồng tiếng ở mỗi design: upload MP3/WAV PCM hoặc tạo giọng AI qua 9router chung, nghe/duyệt/loại take.
- Timeline toàn video 30fps: bắt đầu, trim, duration, gain, fades, label/speaker, split/duplicate/remove và overlap chủ ý. Narration có thể qua nhiều scene. Cảnh/timeline stale phải được kiểm tra và duyệt lại; edit mới không tự ghi đè approved revision.
- Full-video Player và production `video.render` cùng dùng `VideoComposition`/`VoiceoverTrack`; `Audio` từ `@remotion/media`4.0.537, không gọi model trong render. Giữ SceneDSL/ScriptDSLv1 và SceneView/talk-state hiện có.
- Upload raw bytes ≤25MiB, metadata ≤600s, đúng1audio/0video track, MIME/container/codec allowlist; WAV kiểm RIFF/chunk bounds và PCM alignment trước parser để chặn truncation. Hỗ trợ RIFF little-endian integer PCM8/16/24/32-bit, gồm extensible PCM; không nhận float/RIFX/RF64.
- RequestId chống double-submit; TTS có persistent outbound claim, không tự POST lại khi timeout/redelivery. Không suy ra voice mặc định; model thiếu metadata wire voice rõ ràng bị disable kèm lý do.
- Render request chốt snapshot ID/hash khi enqueue; worker kiểm lại trước bundle, copy+rehash PNG/audio, manifest cùng output. Silent phải chọn rõ ràng; payload legacy tiếp tục silent. Completed artifact redelivery xác minh request/manifest/output bất biến trước kiểm freshness, không bị timeline mới làm mất bản render cũ.
- HTTP files bổ sung audio/mpeg và audio/wav, giữ streaming và Range hiện có. Worker Docker copy package-lock để lưu lock fingerprint.

## Dữ liệu và phiên bản

Migration `0004_remotion_voiceover`: audio_takes, voiceover_timelines; target_type thêm audio_take/voiceover_timeline; renders thêm voiceover_timeline_id/voiceover_snapshot_hash nullable. Không sửa các migration đã áp dụng.

Đã pg_dump local trước migration vào ignored workspace; dump491767bytes. Migration runner báo thành công132ms. Trước/sau: assets17→17, variants23→23, videos1→1, migration history4→5; audio_takes0, voiceover_timelines0. Không reset/reseed DB.

Versions: Next15.5.28, React19.1.0, Remotion4.0.537, Mediabunny1.61.6, Drizzle0.45.4/kit0.31.11. Chỉ thêm direct deps `@remotion/media`4.0.537 và `mediabunny`1.61.6; so lock với inherited baseline không có package version đổi.

## Verification và giới hạn

- Full host lint và source-only lint đã pass trước review fixes; final source-only lint sau fixes exit0.
- Final `npx tsc --noEmit` sau fixes exit0.
- Host Next build và Docker app/worker build sau review fixes đều pass exit0. Deploy app/worker mới giữ local DB và data junction; app healthy, worker.started, health endpoint ok, trang Lồng tiếng HTTP200 có upload và thông báo TTS unavailable. Worker có package-lock/strict WAVE validator; render source hash trong container khớp host. Đây là read-only deployment verification, chưa phải audio smoke.
- Fresh review gpt-6-astra:0Critical,3Important,0Minor. Cả3 đã được sửa trong một lượt: completed-render redelivery, truncated WAV, timeline edit-during-save (fieldset disabled khi pending). Source review và static verification; chưa chạy live reproduction vì chưa được duyệt smoke.
- Không viết/sửa/chạy formal tests theo AGENTS. Không tuyên bố đã nghe audio, quan sát HTTP seek, tạo TTS hoặc kiểm AAC của video xuất.
- Read-only discovery dùng module thật:9router hiện0TTSmodels/0readyvoices. Queue và audio_jobs đều0 trước khi bật worker mới. Đây là prerequisite vận hành, không phải bỏ TTS khỏi bản đầu.
- Các thay đổi Docker/Supabase/dimensions/animation-lab/Boston có trước được giữ; saved baselines giúp tách đúng phần audio khi review. Graph cũ chỉ dùng tham khảo, source hiện hành là căn cứ.

## Kiểm tra trên local

Trang design hiện có: `http://127.0.0.1:3000/designs/893e69f7-16fe-4c26-9bb0-dd1a629b94d2/voiceover` sau khi deploy app mới. Có thể upload/chuẩn bị take trước; lưu/duyệt/preview timeline yêu cầu script và mọi scene production đã duyệt. DB hiện có1script approved và **5scene failed**, nên gate production chưa đạt. Không dùng composition Boston riêng để vượt gate này và không tự gọi lại scenes.generate trong scope audio.

## Smoke tiếp theo — đề xuất, chưa thực hiện

Trước khi sinh job cần đủ: user chỉ định file MP3/WAV, router công bố model/voice có metadata hợp lệ, và có design với script/scenes production đã duyệt. User duyệt riêng model/voice/lời đọc và quyền review audio/timeline; không tự approve nội dung.

Budget đề xuất: **1 file giọng có sẵn + đúng1 TTS take +1 production render có tiếng**, tối đa1silent render nếu chưa có bằng chứng tương thích phù hợp. Không tự retry model hoặc tăng budget.

Lời narrator gợi ý để user chỉnh/duyệt (chưa gửi provider):

> A flash of light brings Puno to Boston Harbor. On the pier, two workers lift the tea crates and toss them into the water. Puno watches as the final crate disappears below the surface.

Trong timeline dùng cả2nguồn, có trim/gain/fade và narration qua scene boundary. Nghe preview và MP4 tại các mốc start/trim/boundary/end, kiểm H264+AAC1920×1080@30fps, duration bằng tổng scene, manifest/hash. Negative scenarios chỉ thao tác manual: sai file/oversize, requestId trùng, bounds/fade/overlap và stale gate. Không cố tạo timeout upstream live chỉ để gây lỗi/tốn phí; no-retry/claim được review source và báo phần chưa quan sát.

## Quyết định và phần review không đánh giá live

- AGENTS cấm tests và plan cấm tự commit/push thắng yêu cầu test/commit trong skill; giữ ledger và worktree. Hệ quả: dùng static checks, chưa có automated regression coverage.
- Live TTS/playback/seek/AAC còn chờ smoke có dữ liệu và quyền cụ thể; không được gọi bản đầu đã PASS đầy đủ.
- Provider-specific behavior chỉ bật khi metadata đủ; không có voice default/fallback ẩn. Hệ quả: một provider có TTS nhưng metadata chưa đủ vẫn có thể hiện unavailable.
- Inherited dirty changes ngoài audio được loại khỏi review; migration/backup/static checks do root trực tiếp xác minh, không coi reviewer read-only là người đã chạy các lệnh đó.

Nguồn API chính thức và khảo sát Context7: [spec §8](../superpowers/specs/2026-10-24-remotion-voiceover-design.md). Thêm đối chiếu [Next15.5.28 auto HEAD](https://github.com/vercel/next.js/blob/v15.5.28/packages/next/src/server/route-modules/app-route/helpers/auto-implement-methods.ts), [Drizzle0.45.4](https://github.com/drizzle-team/drizzle-orm/tree/0.45.4), [Mediabunny1.61.6 WAVE parser](https://github.com/Vanilagy/mediabunny/blob/v1.61.6/src/wave/wave-demuxer.ts) và [9router pinned voices route](https://github.com/decolua/9router/blob/6ed886857da125f4908a8a3c3e64f7f1d8ff8366/src/app/api/v1/audio/voices/route.js).
