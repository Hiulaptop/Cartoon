# Binary Search English v1 — acceptance record

Updated 2026-11-01. **Source implementation only; no episode audio or MP4 has been generated.** This record is not runtime permission or release approval.

## Implemented and checked

- English content: 39 cues, 1,121 words, five chapters. Actual CLI `validate` succeeded; exact voice requests split 24 + 15 cues.
- Both actual request files passed the existing Python voice `validate` command using `-I`; no inference was requested.
- Deterministic inclusive-bound search trace, caption/SRT math, verified voice-publication adapter, landscape Remotion composition and explicit prepare/inspect/stills/segment/render commands implemented.
- `npx tsc --noEmit`: exit 0 during implementation. Scripts remain excluded by the existing app tsconfig; this is not a claim that every CLI branch ran.
- Scoped ESLint on the new TypeScript/TSX sources: exit 0. Whole-repository `npm run lint` failed because it scanned third-party Gradio JavaScript in the existing Python venv under `data/spikes`; no unrelated configuration changed.
- `npm run build`: exit 0; Next.js 15.5.28 compiled, checked types and generated pages successfully. This app build does not bundle or validate the standalone Remotion composition at runtime.
- Dataviz palette validator: passed for the selected dark-surface blue/orange palette. This does not certify frame layout.
- Independent read-only source review: completed, with four Important findings confirmed by source inspection. One scoped fix pass added a pre-check phase, revised editorial beats and c24 still coverage, aggregated all caption-density diagnostics before output creation, and rejected review paths overlapping default/configured DATA_DIR. No narration/request text changed. Real audio/frame verification remains pending.
- Post-review verification: actual content `validate`, scoped ESLint, app `tsc --noEmit` and a separate strict no-emit check of `scripts/binary-search-video.mts` with ES2022/ESNext/bundler/react-jsx flags all exited 0. The standalone check exposed and now covers the previously unchecked visual lookup typing. The app build above predates these review fixes.
- Review limitations retained: estimated beats are not speech alignment; font fallback/synthetic bold, late beat-range validation, pixel-format verification, provenance/version/atomic-publication refinements, final-naming order, additional prepared-field binding, hard-coded display labels and progress-log verbosity remain deferred. Treat technical completion records as necessary, not final-named files alone. See the local progress ledger for the complete disposition.

Evidence logs are local under `.superpowers/sdd/2026-11-01-binary-search-english-video/`. No tests, fixtures or mocks were written or run.

## Pending gates

| Item | Actual state |
| --- | --- |
| Exact transcript + finite speech budget permission | Not obtained |
| Ryan speech generation (39 initial cue attempts; no retries proposed) | Not run |
| Publication verification and real episode preparation | Not run |
| Actual audio-derived duration and caption density | Unknown; target 7:30–8:30 |
| Actual composition bundle/browser execution | Not run |
| Named stills and binary chapter preview | Not rendered; permission pending |
| Frame layout, bounds, counters and caption inspection | Pending real frames |
| Full MP4 / SRT / output provenance | Not produced |
| Full listening / speech accuracy / editorial review | Pending |
| Production release / upload | Not released; outside scope |

Do not mark this episode complete based on static checks. No DB, migrations, app jobs, Comfy inference, package/model/browser installation, paid APIs, uploads or commits are authorized by this record.

## Sources and tool limitations

- Approved design and plan: `docs/superpowers/specs/2026-11-01-binary-search-english-video-design.md` and `docs/superpowers/plans/2026-11-01-binary-search-english-video.md`.
- Algorithm claims and counting conventions: `sources.md`; Princeton https://algs4.cs.princeton.edu/11model/.
- Voice source: official https://github.com/QwenLM/Qwen3-TTS and existing guarded `scripts/english_voice.py` implementation.
- Rendering APIs: official https://www.remotion.dev/docs/renderer/render-media and https://www.remotion.dev/docs/audio, cross-checked with installed 4.0.537 source/types.
- Context7 and understand-anything were unavailable. The user explicitly authorized official documentation and targeted installed-source review instead; no knowledge graph was created or claimed.
