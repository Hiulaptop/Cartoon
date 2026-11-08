# Binary Search — English local video v1

One local episode, 39 cues / 1,121 words, landscape 1920×1080 at 30fps. Target 7:30–8:30; actual runtime comes from speech samples. This is not an eight-minute completed video yet, a Comfy video graph, a production app integration or a measured search-performance benchmark.

## Content to review

- `transcript.md`: exact English narration, five chapters.
- `episode.json`: same text, estimated caption segmentation and deterministic visual beats.
- `voice-request-01.json`: 24 cues; `voice-request-02.json`: 15 cues. Ryan/English, existing candidate delivery presets, fixed explicit seeds.
- `sources.md`: claim references and counting conventions.
- `acceptance.md`: actual verified and pending states.

## Validation (no speech)

Run from repository root with the existing installed tools; no install is necessary:

```powershell
node_modules/.bin/tsx scripts/binary-search-video.mts help
node_modules/.bin/tsx scripts/binary-search-video.mts validate --pack workflows/video/binary-search-english/v1
& "data/spikes/qwen-tts-20261030/env/Scripts/python.exe" -I scripts/english_voice.py validate --request workflows/video/binary-search-english/v1/voice-request-01.json
& "data/spikes/qwen-tts-20261030/env/Scripts/python.exe" -I scripts/english_voice.py validate --request workflows/video/binary-search-english/v1/voice-request-02.json
```

Check model/runtime using existing voice `preflight` before authorized inference; do not download, install, switch device/model/voice or weaken guards if blocked. Refer to `workflows/voice/qwen-english/v1/README.md` for its exact immutable request/cache/attempt semantics. Private voice outputs must remain outside repo and DATA_DIR; inspect the target's parent and obtain permission for the exact requests and finite attempt budget before `run`. Technical flags are not user consent.

Proposed initial budget is 39 attempts, split24+15, no replacements/retries. Failed attempts consume budget and stop the batch. Do not automatically continue past a failed cue, rerun inference, delete locks or overwrite commits. Full listening remains necessary; matching input text is not a waveform transcript.

## Prepare after authorized, completed speech

Example paths below are proposals, not authorization. Inspect/confirm actual paths first. `D:/binary-search-voice-20261101` is a new dedicated private voice root; `D:/binary-search-review-20261101` must not already exist. No root is created by reading this README.

```powershell
node_modules/.bin/tsx scripts/binary-search-video.mts prepare --pack workflows/video/binary-search-english/v1 --voice-root D:/binary-search-voice-20261101 --python data/spikes/qwen-tts-20261030/env/Scripts/python.exe --output D:/binary-search-review-20261101
node_modules/.bin/tsx scripts/binary-search-video.mts inspect --output D:/binary-search-review-20261101
```

Prepare invokes existing read-only Python `verify` for each request, checks request identity, completion/publication hashes, WAV hashes and integer timing, then copies only selected WAVs and an installed Geist font. The voice root must not be modified concurrently. Nonempty/partial render roots are not adopted; a failed preparation leaves evidence and needs a new output directory. It cannot generate speech. Output must be outside DATA_DIR (including the default `./data`); overlapping paths are refused because `/api/files` can serve DATA_DIR without authentication. The CLI loads `.env` locally to respect the app's DATA_DIR configuration, without logging secrets.

Captions are exact words but **estimated character-weighted timing**, not forced alignment. The adapter collects density issues across all verified cues, reporting cue IDs, segment details, actual total duration and chapter boundaries before refusing output creation; it never drops words. Visual beat fractions are editorial estimates until reviewed against real narration, not measured speech alignment. Revise text/timing only with appropriate review/new speech permission; do not fake the duration. Exact before/after states and candidate counts come from one trace. Aggregate linear cells are labeled, and the tiny interval's minimum-size marker is explicitly not to scale.

## Explicit rendering after permission

Existing local browser (never auto-downloaded):
`node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe`.

```powershell
node_modules/.bin/tsx scripts/binary-search-video.mts stills --output D:/binary-search-review-20261101 --browser node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe --execute
node_modules/.bin/tsx scripts/binary-search-video.mts segment --output D:/binary-search-review-20261101 --browser node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe --chapter binary --execute
node_modules/.bin/tsx scripts/binary-search-video.mts render --output D:/binary-search-review-20261101 --browser node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe --execute
```

Commands are independent; none starts the next automatically. Each creates a UUID attempt directory, concurrency1, no overwrite/auto-retry. Minimum free-space guard5GiB is conservative, not a capacity guarantee. A successful render is H.264/AAC/yuv420p; actual dimensions/fps/duration/codec metadata are checked before final naming. `render-complete.json` is published last and binds source/content/voice/output hashes. Partial drafts remain on failure. A full render also includes `episode.srt`, transcript and sources. Production/listening/editorial states remain pending/not-released until genuine review.

No public server, app jobs, DB/migrations, Comfy calls, paid APIs, uploads or background music. No tests or test fixtures were added/run. Local generated media/evidence is not portable with a git clone. Static checks do not certify visual layout, speech accuracy or duration.
