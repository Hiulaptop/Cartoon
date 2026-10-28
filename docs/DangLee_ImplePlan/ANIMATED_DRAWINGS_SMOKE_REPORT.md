# AnimatedDrawings smoke report — 2026-10-23

> **Hướng này đã dừng theo yêu cầu mới:** animation hoàn toàn bằng Remotion. Report dưới đây chỉ lưu lịch sử build; đề xuất tiếp tục môi trường Debian ở cuối không còn là công việc đang thực hiện. Xem [plan Remotion](../superpowers/plans/2026-10-23-remotion-animation.md).

## Result

**BLOCKED AT ENVIRONMENT BUILD. No GIF produced.** User approved the standalone manual smoke scope in §6.2 of `thanhpahm-motioncanvas-parody.md`. Product integration and schema changes remain unapproved and were not performed.

## Verified environment

- Windows laptop, approximately 15.7 GiB usable physical RAM; free RAM before Docker startup about 3.77 GiB, after startup about 1.89 GiB. Runtime limit is a maximum, not preallocated memory. Recheck resource headroom before any resumed render.
- D: free space about 168 GiB at preflight.
- Docker Desktop started using `docker desktop start --timeout 45`.
- Docker Engine 29.7.2, Compose 5.5.1, Linux engine reporting about 7.62 GiB RAM.
- Existing restart-policy containers started with Docker; no service was deliberately stopped/reset and no migration was invoked.
- Upstream SHA: `b859684857519c7424da51a0b0862fbd1fd258f4`.
- Python base manifest list: `sha256:dd46e1cb12432c17040638acb05508c35dc828db04f4f33c692d3894b7bc76cf`.
- Selected Python 3.8.13 bullseye amd64 digest: `sha256:db831ae8c7e88ca6f69465a7c3f255c03678e830a1ad13c2a340bec9fc232d3e`.
- Compose configuration validation: exit 0.

## Build attempts and evidence

1. Official Debian repositories over HTTP: apt update completed, package downloads failed with HTTP 404; build exit 1 (apt exit 100).
2. Same repositories over HTTPS, same Python image and requested packages: same HTTP 404, build exit 1 (apt exit 100).

Examples from the HTTPS build log:

```text
libglapi-mesa_20.3.5-1%2bdeb11u1_amd64.deb: 404 Not Found
libgl1-mesa-dri_20.3.5-1%2bdeb11u1_amd64.deb: 404 Not Found
libglx-mesa0_20.3.5-1%2bdeb11u1_amd64.deb: 404 Not Found
libglib2.0-0_2.66.8-1%2bdeb11u8_amd64.deb: 404 Not Found
libosmesa6_20.3.5-1%2bdeb11u1_amd64.deb: 404 Not Found
```

The observed blocker is package retrieval from the official Debian mirror, before Python dependency resolution or AnimatedDrawings execution. HTTPS did not resolve it. This evidence does not establish whether the mirror/index inconsistency is temporary or due to release archival; no cause beyond the observed 404 is asserted.

Logs relative to repo root:

- `data/experiments/animated-drawings/2026-10-23-r1/build.log`.
- `data/experiments/animated-drawings/2026-10-23-r1/build-https.log`.

## Approved scenarios: actual status

- Preflight: performed; recheck free RAM before continuation.
- Render pre-rigged char3/dab sample: **not run**, image unavailable.
- GIF transparency and visual inspection on light/dark backgrounds: **not run**.
- Invalid character path error handling: **not run**.
- User artistic review: **pending**, no clip available.
- Python package resolution, final image digest, render duration/fps/peak memory: **unavailable**, not fabricated from upstream claims.

## Files prepared

Isolated `scripts/spikes/animated-drawings/` contains Dockerfile, compose.yaml, sample.yaml and README.md. Vendor source and build logs are under ignored runtime data. No product code, app dependency files, database schema or migration changed for this trial. No existing *.test.* or *.spec.* file was run.

## Proposed next step, not executed

Amend the environment plan to use a verified, signed official Debian snapshot/archive that contains the matching packages while retaining Python 3.8.13 and the pinned upstream SHA. Verify availability and signatures first. If that cannot work, propose a different base environment explicitly. Recheck memory before building/rendering; do not stop unrelated services to make room without permission.

Do not mark AnimatedDrawings accepted or rejected on visual quality until the user can inspect an actual output, and do not infer compatibility with custom assets from the upstream sample.

Sources: [upstream setup.py](https://github.com/facebookresearch/AnimatedDrawings/blob/b859684857519c7424da51a0b0862fbd1fd258f4/setup.py), [headless/export instructions](https://github.com/facebookresearch/AnimatedDrawings/blob/b859684857519c7424da51a0b0862fbd1fd258f4/README.md), and local build logs above.
