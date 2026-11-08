# Acceptance record — English voice workflow v1

Date: 2026-10-30. Native implementation approved in chat after written spec/plan. This record separates implementation/source checks from runtime and listening acceptance.

## Checked without inference

- Existing dirty feature checkout retained; baseline HEAD d5e742b. No unrelated files staged/committed, no app/demo/image pack edits.
- Real operator example: default CLI validation exit 0, three effective English/Ryan cues with exact preset instructions. Request canonical hash `4bf98d92d946472e30ab80f6fe018df92b4536050d08d29851caf6f5053d6809`.
- `--help` exit 0. In-memory Python `compile()` checks (no pyc/test files).
- Existing model: all 11 release files rehashed; both LFS weights matched SHA256/size, nine small files matched downloaded upstream Git blob OIDs before recording SHA256. No weights downloaded/modified.
- Read-only preflight exit 0: pinned model revision, complete dependency metadata inventory/Qwen source hashes, Python 3.12.10 and six package baseline versions, explicit generation settings, three waveform fingerprints. No Qwen/torch import/model load/inference in validation or preflight. Evidence is local in `.superpowers/sdd/2026-10-30-english-voice-workflow/preflight.json`; later code edits change fingerprints, so use the final refreshed evidence/manifest.
- Refreshed preflight: 11 model files, 89 dependency records, 17 installed Qwen source files, seven local code files. Actual example is 29/31/31 words (91 total), 145/204/175 code points; each fits the proposed pilot limits. Exact fingerprints are code-sensitive and recorded with final manifest after review.
- Scoped whitespace/local absolute-path/secret-pattern scan: 12 tool/pack files, no matches; `git diff --check` exit 0. This bounded pattern scan is not a comprehensive secret audit.
- Actual JS lock versions: Next 15.5.28, React 19.1.0, Remotion 4.0.537, TypeScript 5.9.3. No JS dependencies changed by this work.

## Runtime evidence — approved three-cue pilot

After user requested the full current voice flow, the unchanged tool/input/model ran with short private output `D:/voice-pilot-20261030`. Generation exit 0; three attempts total, exactly one per cue; elapsed 393.625 seconds including inventory/load/generation/publication and diagnostic tracing. Read-only `verify --output D:/voice-pilot-20261030 --request-id english-voice-pilot-v1` exit 0: technical ready, listening pending, production not_released, inference false for verification.

| Cue | Audio seconds | Samples | Rate | PCM rail samples |
|---|---:|---:|---:|---:|
| hook / engaging-hook | 11.28 | 270720 | 24000 | 0 |
| explanation / clear-explainer | 18.00 | 432000 | 24000 | 0 |
| story / warm-story | 12.64 | 303360 | 24000 | 0 |

All WAVs mono PCM16; 41.92 seconds audio total. Published timeline 1322 frames at 30 fps (44.0667 seconds including per-cue lead/tail), publication ID `b73cebf4c2d74e06ba3c274dd4360c78`. Verified metadata/identity/WAV hashes and sample-derived timeline; all ledger rows ready, one attempt directory each, no remaining runner lock. Exact WAV hashes in manifest.

Runtime printed missing SoX and flash-attn warnings plus pad-token notices; no installation or fallback changes were made. Existing CPU float32/SDPA and merged-kwargs guards passed on actual load. These warnings did not prevent this CustomVoice generation, but do not certify other SoX-dependent paths. No independent transcript or listening acceptance.

## Boundary evidence and remaining limits

| Boundary | Implementation intent | Evidence limit |
|---|---|---|
| Input | Strict keys/types/duplicates, text/word bounds, explicit seeds, only LF normalization | Real example validation only; no fabricated malformed requests |
| Fingerprint | Effective cue, model inventory, installed Qwen source, dependency/runtime/code, PCM16 settings; no ID/order/absolute path | Source + actual preflight, not perturbation exercises |
| Root/paths | Dedicated marker; nonempty unmarked/model/demo/code root rejected; ancestor symlink/junction/reparse checks | Source only; trusted local filesystem, no adversarial TOCTOU claim |
| Lock | Exclusive create, owner token, flush/fsync, finally release; never steal stale locks | No concurrent runners or forced crash |
| Attempts | Immutable identity/generating before model call; commit after WAV/metadata checks | Short-root pilot: three committed attempts, one per cue; no interruption exercise |
| Recovery | Commit inspection before cache reuse, relink stale ledger; partial/corrupt no automatic inference | Cache hit/resume/retry not runtime exercised |
| Budget | Mandatory execute/max-new-cues, attempted generation including failure consumes budget, zero budget never backend load | Successful pilot used three; zero-budget/exhaustion/failure accounting not exercised |
| Audio | Returned rate, mono finite source guards, PCM16 write/decode/hash/metrics, no silent normalization | Three real WAVs generated and decoded/verified; rejection branch not exercised |
| Publication | All cues verified ready; immutable publication and complete.json last; read-only verify rebuilds timing | Real publication and independent CLI verify exit 0 |
| Timeline | Integer sample/rate ceil, lead6/tail15, audio end exclusive | Real sample-derived 1322-frame timeline verified; no renderer adapter |

## Pending / not accepted

- Three-cue pilot: **exact text/seeds and max-three-attempt budget approved in chat; invocation stopped before inference**, exit 2 `Input/preflight stopped: Noncanonical filesystem path`. No automatic rerun.
- Read-only diagnosis: the actual Python interpreter resolves newly created descendants of the nominal LocalAppData output path into its PythonSoftwareFoundation package LocalCache tree. `open_root` creates the initially absent directory, then `child` rechecks it and `safe_path` rejects the now-existing noncanonical path. Observed root is empty: no marker, lock, run, attempt or WAV. Source/settings were not changed; this run provides no backend/audio acceptance. Next remedy must use an inspected canonical private path without weakening path guards.
- Canonical-path continuation separately approved; invocation exited 5 `Runtime stopped (FileNotFoundError)` before a recorded generation attempt. Retained marker/request/binding/ledger and empty hook attempts parent; all cue states pending, attemptId null, no WAV/commit/publication/remaining lock. No automatic rerun or cleanup. Exact failing filesystem call is not captured; path-length involvement is unconfirmed (root 135 characters; prospective attempt directory 248).
- Historical filesystem failures above are retained, not the current pilot result. Short private root subsequently completed; source/guards unchanged. Old exact FileNotFoundError syscall remains unconfirmed; no registry/long-path setting changes.
- Actual CPU backend load and WAV generation/decode: **exercised successfully by the bounded pilot**; not a general throughput/portability guarantee.
- Cache reuse across another run, duplicate cue deduplication, zero-budget recovery, explicit retries: **unverified**.
- Crash/corruption/concurrency/path-race behavior: **unverified**, no forced exercises authorized.
- Human listening/prosody/intelligibility/completeness: **pending**. Previous 18-cue demo is not acceptance evidence for new presets/tool.
- Independent final source review: **completed**, claudeAgent / claude-opus-5-5. Reviewer found 0 Critical, 2 Important, 8 Minor; author verified and fixed both Important, re-graded/fixed control tokens, retry selection and global -I enforcement in one source fix pass; tracked-root denylist minor resolved by private-output fix. No second review or runtime exercise.
- Deferred minors: malformed/missing artifact exit classification can be 5/2 instead of 3 (fails closed); same-seed retry may reproduce rejected output; legacy non-UTF8 stdout can misreport runtime failure; preset-check comment and budget-exhaustion wording overstate details.
- Private output must be outside repository and shell DATA_DIR. App custom DATA_DIR only in .env/compose must be confirmed/exported by operator; no .env/route changes. Rejected finite numeric source is quarantined as non-pickled .npy with available metrics/safe validation errors; rejection branch remains runtime unverified.
- Production: **not_released**. No Comfy node/app integration, schema/migration, flags, services, tunnel, upload or render.

No tests written/run, no fixtures/mocks. npm lint/tsc/build skipped because this scope only adds Python/JSON/documentation, not app code. Local .superpowers/data evidence, venv and model are gitignored and absent after clone. Manifest raw hashes deliberately exclude itself to avoid a circular hash.
