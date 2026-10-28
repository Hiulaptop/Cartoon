# AnimatedDrawings standalone smoke trial

> **Retired direction:** the user switched all animation to Remotion. This directory is retained as historical spike scaffolding. Do not resume the old smoke trial under its prior approval. See `docs/superpowers/plans/2026-10-23-remotion-animation.md`.

Scope and approval: `docs/DangLee_ImplePlan/thanhpahm-motioncanvas-parody.md` §6.2, approved by the user in chat on 2026-10-23. This is an isolated operational spike, not product integration. Later test runs still require the explicit run authorization specified by AGENTS.md.

## Pinned baseline

- Upstream: https://github.com/facebookresearch/AnimatedDrawings
- Commit: `b859684857519c7424da51a0b0862fbd1fd258f4`.
- Local source: `data/experiments/animated-drawings/upstream` (ignored).
- Python 3.8.13 slim bullseye, linux/amd64 digest `sha256:db831ae8c7e88ca6f69465a7c3f255c03678e830a1ad13c2a340bec9fc232d3e`.
- Mesa software renderer; no GPU, model downloads, TorchServe service, API keys or database connection.
- Runtime: 2 CPU, 4 GiB maximum RAM, no swap beyond that limit, no network, non-root user, read-only root filesystem, 600-second render deadline.

The local upstream checkout must resolve to the pinned SHA before building. The Dockerfile copies only setup.py, animated_drawings and examples, without the vendor Git database. All application dependency files remain separate.

## Current result: build blocked

The 2026-10-23 attempt failed before Python dependency installation: Debian bullseye security package indices reference Mesa/GLib files returning HTTP 404. Switching the same official mirror from HTTP to HTTPS reproduced the failure. No image completed and no render was run. Do not interpret this as a failed quality evaluation of AnimatedDrawings.

Logs: `data/experiments/animated-drawings/2026-10-23-r1/build.log` and `build-https.log`.

See `docs/DangLee_ImplePlan/ANIMATED_DRAWINGS_SMOKE_REPORT.md` before attempting changes to the baseline. A verified repository snapshot or a different base environment needs a plan amendment; do not silently change Python/upstream dependency versions or disable package signature verification.

## Commands for an authorized run after resolving the blocker

From the Cartoon repository root:

```powershell
git -C data/experiments/animated-drawings/upstream rev-parse HEAD
docker compose -f scripts/spikes/animated-drawings/compose.yaml config --quiet
docker compose --progress plain -f scripts/spikes/animated-drawings/compose.yaml build
docker compose -f scripts/spikes/animated-drawings/compose.yaml run --rm --no-deps sample
```

Output: `data/experiments/animated-drawings/2026-10-23-r1/sample.gif`. Do not run against an existing successful output directory without preserving its report/artifacts first.

The configuration uses the upstream pre-rigged char3/dab sample at 512×512, keeping the entire original motion. It does not verify custom designer characters or Remotion ingestion. The build must complete before recording Python package resolution or running the approved missing-character/transparency scenarios.
