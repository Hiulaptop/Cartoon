# Local English voice workflow v1

Stage 2: approved text → Qwen Ryan WAV per cue → provenance/cache → sample-derived timeline. Outside ComfyUI and the app. No service, queue, render, SRT, upload or production activation. The old three-video demo remains unchanged; its audio does not certify this tool.

## Baseline and permissions

Python 3.12.10; qwen-tts 0.1.1, transformers 4.57.3, torch 2.15.0+cpu, torchaudio 2.11.1+cpu, numpy 2.5.4, soundfile 0.14.0. Existing local model: Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice at revision `0c0e3051f131929182e2c023b9537f8b1c68adfe`. See manifest for all 11 bundle hashes. No automatic install/download, remote code, device/model/provider fallback or voice cloning.

Use the existing venv's interpreter, always with `-I`. The entrypoint admits only its checked sibling package directory to the import path; it does not add the model directory or working directory. Run from repo root. In PowerShell:

```powershell
$python = "data/spikes/qwen-tts-20261030/env/Scripts/python.exe"
$model = "data/spikes/qwen-tts-20261030/model"
$request = "workflows/voice/qwen-english/v1/request.example.json"
& $python -I scripts/english_voice.py --help
& $python -I scripts/english_voice.py --request $request
& $python -I scripts/english_voice.py validate --request $request
& $python -I scripts/english_voice.py preflight --request $request --model $model
```

These commands do not load the speech model or generate audio. Preflight reads/hashes the entire bundle (roughly 4.5 GB), installed Qwen Python source, code and dependency metadata; it prints local diagnostic paths to stdout. Do not publish those diagnostics accidentally. Validation has no output-root writes. No JS dependency changes: repo Next 15.5.28, React 19.1.0, Remotion 4.0.537, TypeScript 5.9.3.

## Operator input

Edit a copy of request.example.json and obtain content/budget approval before generation. Example has three candidate deliveries, not listening-accepted presets. Override `instruction` replaces, not appends to, the preset. English/Ryan/fps30 only; 1–24 cues, text ≤400 Unicode code points and ≤60 whitespace words, instruction ≤500 code points, explicit integer seed 0..2^32−1. Unknown/duplicate keys and bool-as-int are rejected. Only line endings normalize. Text is narration, not executable SSML; model control-token syntax such as `<|im_end|>` is rejected rather than treated as literal speech. IDs match ASCII `[A-Za-z0-9_-]{1,64}`; Windows device names and case-colliding cue IDs are additionally rejected for filesystem safety.

## Execution — NOT authorized by implementation approval

The following is documentation, **not permission to run**. A separate chat approval must cover the exact request and finite inference budget. Proposed pilot: three cues, one per preset, 20–40 words/cue, total ≤120 words, no replacements. Do not execute until approved.

```powershell
$output = Join-Path $env:LOCALAPPDATA "CartoonVoice/private/pilot-v1" # dedicated private storage outside repo and DATA_DIR
& $python -I scripts/english_voice.py run --request $request --model $model --output $output --execute --max-new-cues 3
```

Pilot operator note (2026-10-30): the Microsoft Store Python environment redirected the nominal LocalAppData path, then the deep canonical package path failed before any attempt. The unchanged tool completed using short private `D:/voice-pilot-20261030`. Prefer a short, inspected canonical root outside the repo/DATA_DIR; the LocalAppData example is not portable on every Windows interpreter. No guard or system long-path settings were weakened.

Output roots inside the repository (including data/public/docs) or overlapping the app DATA_DIR are rejected. If the app uses a custom DATA_DIR supplied through .env/compose rather than this shell, the operator must confirm that path and export the same DATA_DIR in this shell before running; the tool does not read .env. Private output is not automatically gitignored or backed up: keep it outside web-served mounts and manage it locally.

Both `--execute` and `--max-new-cues` are mandatory. An attempt consumes budget before backend load/generation, even if it fails. No automatic retry. One lazy backend, sequential cues, explicit per-cue seed. Qualitative instructions do not promise exact pace/pause/WPM/duration. No bit-identical guarantee across runtime/CPU changes.

## Resume, verification and review

Same request ID binds an immutable parsed-original snapshot **and** effective cues/runtime/model/code identity. Reorder/change content under a new ID. Changed code/runtime provenance also needs a new ID; healthy waveform commits can be reused only under their exact fingerprint. Cue IDs/order/fps/padding do not enter waveform identity.

```powershell
# Still requires authorization for output mutation, but cannot load/generate the model:
& $python -I scripts/english_voice.py run --request $request --model $model --output $output --execute --max-new-cues 0
# Existing root only, read-only; stops if lock/partial/stale/corrupt artifacts exist:
& $python -I scripts/english_voice.py verify --output $output --request-id english-voice-pilot-v1
# Only after explicit review and NEW retry permission/budget; retains previous attempts:
# & $python -I scripts/english_voice.py run --request $request --model $model --output $output --execute --max-new-cues 1 --retry-cue hook
```

A cache hit verifies commit/identity/metadata/WAV hashes, PCM16 decoding and sample count/rate. Commit exists but ledger stale: run may relink it without inference. Missing/ambiguous/corrupt/uncommitted artifacts never cause implicit generation. Retry is only explicit for failed/needs_review cues without a successful commit; with --retry-cue the invocation never spends budget on an unselected cue, and stops if an earlier unready cue blocks ordered completion. Corrupt successful commits are never overwritten. Partial publication requires manual review, not regeneration.

A root marker proves dedicated ownership. Nonempty unmarked roots and linked paths are rejected. `.runner.lock` contains PID/token/time; no timeout stealing or unlock command. If it remains after interruption, inspect process identity/liveness and retained evidence, then obtain permission for any manual lock action. Do not delete a lock merely because it looks old. Never move/delete committed attempts casually.

Single-file temp+flush+fsync+replace and commit-last records reduce ambiguous success; they are not multi-file power-loss transactions. This is a trusted-user local single writer, not a hardened adversarial filesystem/multi-user service. Do not modify the model/package/code concurrently with a run. Symlink/junction checks are not a promise against every TOCTOU race.

## Output layout and timing

```text
ROOT/.english-voice-root.json
ROOT/.runner.lock                         # only during writer invocation
ROOT/runs/ID/request.json                 # immutable original parsed JSON
ROOT/runs/ID/binding.json                 # immutable effective cues and identity
ROOT/runs/ID/ledger.json                  # pending/generating/ready/failed/needs_review
ROOT/cache/FP/attempts/UUID/identity.json
ROOT/cache/FP/attempts/UUID/attempt.json
ROOT/cache/FP/attempts/UUID/audio.wav
ROOT/cache/FP/attempts/UUID/metadata.json   # pre/post quantization metrics
ROOT/cache/FP/attempts/UUID/failure.json   # only on failure
ROOT/cache/FP/commit.json                  # published last
ROOT/runs/ID/publications/UUID/manifest.json
ROOT/runs/ID/publications/UUID/timeline.json
ROOT/runs/ID/complete.json                 # binds both publication hashes, last
```

WAV mono PCM16; returned rate 8–192 kHz, finite waveform, source peak 0.001..1, duration ≥1 and <33s. Reject, do not silently clip/normalize/resample/trim/master. Decoded samples/rate must match, with peak/RMS/PCM-rail metrics retained before and after quantization. Sanity guards do not detect every wrong/missing/repeated spoken word. Rejected finite mono numeric source samples are retained as `rejected-source.npy` (non-pickled, not ready audio); safe validation error text and available peak/rate/sample/duration metrics go into failure.json. They are diagnostic evidence only, never published as a successful WAV. Non-numeric/nonfinite sources are not encoded as audio.

Timeline v1: 30fps; `audioFrames=(sampleCount*30+sampleRate-1)//sampleRate`; block `from` accumulates prior durations; audio begins at `from+6`, ends exclusive at `from+6+audioFrames`; block duration `6+audioFrames+15`. Root includes request ID/hash and total duration. Each cue includes root-relative POSIX src, fingerprint, WAV hash, samples/rate, text/instruction. No invented word timestamps. The old demo renderer cannot consume this schema directly; stage 3 needs a separate adapter/design.

Technical `ready` ≠ listening accepted. Listening remains `pending`, production `not_released`. User must listen for English intelligibility, complete text/endings, repetitions/noise, pacing/tone/pauses. Input text is not an independently verified transcription. There is no listening-approval command in this stage; retain future reviews bound to fingerprint+WAV hash separately.

Exit codes: 0 success; 2 input/preflight/CLI mismatch; 3 needs_review/lock/corruption; 4 budget exhausted with pending cues; 5 backend/runtime failure. Error details are intentionally bounded; artifacts retain attempt identity and failure class, not environment secrets.

## Evidence and sources

See acceptance.md for actual checked versus unexercised states. Local evidence/model/venv under data or .superpowers is gitignored and is **not portable with a clone**. Pack contains no weights/audio and downloads nothing. No tests were written/run. The separately authorized three-cue pilot completed with three WAVs and read-only verification exit 0; see acceptance.md/manifest.json. Cache reuse across runs, forced crash/concurrency/corruption and human listening remain unverified. Private output is outside this clone.

- https://github.com/QwenLM/Qwen3-TTS — local CustomVoice API and returned sample rate; official examples target CUDA, not a CPU throughput promise.
- https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice — official model/voice/license.
- https://docs.python.org/3.12/library/os.html — exclusive creation, fsync, replace.
- https://docs.python.org/3.12/library/pathlib.html — symlink/junction/resolve.
- https://python-soundfile.readthedocs.io/ — WAV/PCM_16/file-object writing and decoding.

Context7 tool discovery returned no matching tool in the author session; upstream sources and installed source/metadata were used. No claim that Context7 is globally unavailable.
