# Binary Search — English long-form video design

Date: 2026-11-01.

Status: **written spec approved by the user in chat on 2026-11-01**, with “duyệt spec”. Approval permits writing the implementation plan; implementation still requires plan approval and an execution-method selection. The user selected Video 1 and the local Qwen Ryan → Remotion approach for an approximately eight-minute English video. New inference and production activation are not authorized by spec approval. No video job has been enqueued for this request.

## 1. Intent and success

Produce the first video in the user's algorithm series: **“Binary Search: Why One Million Items Take Only About 20 Steps?”** The promise is that a beginner can watch once and visualize how the algorithm reasons, rather than memorize code or Big-O definitions.

Deliver a complete English educational video with narration, legible English captions, synchronized deterministic simulations, an English transcript, sources, and an editable local render workflow. It is one video, not the ten-video series and not a production automation rollout.

Target: 1920×1080, 30 fps, approximately eight minutes. Editorial acceptance band: **7:30–8:30**, measured from the completed audio-derived timeline. This is not a promise that a text prompt will produce an exact narration duration. A draft outside the band remains a draft; report actual duration and obtain approval for revisions or a duration exception. Do not pad with long idle frames, truncate speech, loop material, or time-stretch audio to manufacture eight minutes.

Audience/persona source `00-dinh-huong-kenh.md` was referenced in the user's pasted outline but has not been supplied or verified. Use only the stated beginner-friendly, intuition-first promise; do not invent further audience research.

## 2. Current repository and constraints

Read current package.json and existing voice/renderer sources. Next.js 15.5.28, React 19.1.0, Remotion and @remotion/* exactly 4.0.537. Existing package-lock inventory records TypeScript 5.9.3 and sharp 0.35.5; these are not requirements to upgrade anything. Dockerfile uses node:22-bookworm-slim for the worker and node:22-alpine for the app. No dependency or image change is proposed.

Existing algorithm animation contract is portrait 1080×1920, at most 5,400 frames and 12 cells. Its voice defaults are VieNeu/Adam. Do not stretch or mutate that persisted contract to accommodate this video.

Existing local English voice tool: `scripts/english_voice.py` and `scripts/english_voice/`, documented under `workflows/voice/qwen-english/v1/`. It supports English/Ryan, up to 24 cues per request, at most 400 characters and 60 whitespace words per cue, explicit seeds, guarded private outputs and finite inference budgets. Its committed WAVs and sample-derived timeline are the authority; it does not supply word alignment or listening approval.

Existing `src/worker/qwen-english-render.mjs` is hardcoded to three historical demos with six cues each. Preserve it and the old demos. This video needs a separate adapter/composition, not a rename of that throwaway script.

The checkout has substantial unrelated uncommitted changes on feat/mode-switch. Do not reset, stash, stage unrelated files, commit, or push. No DB writes, migrations, production queue use, .env/compose/feature-flag edits, service starts, network changes, downloads or uploads are in scope.

Context7 lookup returned no matching tool in this session. understand-anything tooling/skills were not exposed by the available catalog; no knowledge graph was built. Exploration was restricted to the named voice, rendering and algorithm contract files. Do not claim either required tool was used successfully. Before implementation, retry discovery and report any unresolved tooling requirement rather than silently substituting a fake graph.

## 3. Chosen approach and alternatives

**Chosen: a local, file-based video production workflow using existing Qwen Ryan audio and a dedicated Remotion composition.** No Comfy image generation is needed: arrays, interval bars, counters and mathematical examples must be computed, not hallucinated into images. This is not a full-video ComfyUI graph or app integration.

Alternatives not selected:

- Extend the app's algorithm pipeline: would require persisted contract, duration, aspect ratio, language and voice changes, with a much broader migration/review scope.
- Use diffusion-generated illustrations as the main explanation: adds image-generation work without guaranteeing correct numbers, shrinking intervals or synchronization.

Retain small reusable pieces—trace generation, interval display, cue timing and captions—but do not build a general-purpose ten-video engine now.

## 4. Editorial structure

All rendered titles, labels, captions and narration are English. Operator documentation may be Vietnamese or English. No programming-language code is necessary.

| Approximate section | Narrative and visual outcome |
|---|---|
| 0:00–0:45 | Hook: one million sorted numbers, a target, and the contrast between up to a million checks and at most about twenty midpoint checks. A brief unsystematic guess illustrates lack of elimination; do not call it linear search or claim a random strategy always needs a million guesses. |
| 0:45–2:30 | Define linear search as checking from the beginning. Animate a small readable array, then scale up using a clearly labeled aggregate view and accelerated counter. Establish a worst-case target at the final position. |
| 2:30–5:30 | Explain the sorted-order comparison, inspect a midpoint, and discard the half that cannot contain the target. First use a readable 12-cell worked example, then a compact interval visualization for one million positions. Show active candidate count and inspected-position count side by side. |
| 5:30–7:00 | Show repeated halving numerically before introducing logarithms. Explain that 2^19 = 524,288 and 2^20 = 1,048,576 bracket one million. Clearly separate a halving intuition from the exact discrete search trace. |
| 7:00–8:00 | Recap the invariant, sorted-data requirement, a brief not-found case, and the cost of obtaining/maintaining sorted data. End with an open question about sorting costs; do not promise a specific next release. |

These are editorial targets, not final frame cut points. Actual boundaries follow approved narration samples and animation beats.

Prepare approximately 1,000–1,200 English words, at most **48 cues**, each respecting the existing voice tool limits. The final reviewed transcript—not this outline—is the exact speech input. Avoid repeated filler to hit a word count. Use at most three immutable voice requests, each at most 24 cues, with unique request IDs and stable explicit seeds. Multiple requests avoid changing the voice contract solely for this episode.

## 5. Mathematical and simulation correctness

### Fixed conventions

- Main large example: the sorted array [1, 2, ..., 1,000,000], target 1,000,000, inclusive zero-based bounds internally. Show values and zero-based indexes with distinct labels whenever both appear.
- Binary search: mid = lo + floor((hi - lo) / 2); inspect a[mid] once per iteration; equality finishes; otherwise update lo = mid + 1 or hi = mid - 1.
- Counter label: **“Positions checked”** or **“Search steps”**, not “CPU instructions,” “seconds,” or an ambiguous count of individual comparison operators.
- The main linear example checks 1,000,000 positions; this binary trace checks 20 positions. Not every target requires exactly 20.
- For n ≥ 1, worst-case midpoint inspections under this convention are floor(log2(n)) + 1, equivalently ceil(log2(n + 1)). Explain “at most 20 for one million,” not an exact universal log2(n) identity.
- Candidate count is max(0, hi - lo + 1) from the actual trace. Distinguish state before checking the midpoint from state after elimination; never round a geometric estimate and label it an exact remaining count.
- Small example: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91, 104, 120], target 91. Trace midpoint indexes 5 → 8 → 10 → 9, four checks.
- Not-found example reuses the small array with target 90; finish with an empty interval rather than inventing a matching cell.

### Visual integrity

Generate each state from one deterministic trace; narration, counters, active interval, discarded cells and highlights reference it. Do not hand-author unrelated counters next to illustrative shrinking bars.

For the large example, use a proportional overview bar plus exact numeric bounds/counts and a zoomed local neighborhood. Label aggregate cells/bins explicitly: a drawn bin is not one physical array element. A minimum visible marker may indicate a tiny interval, but annotate its size; do not imply that marker width remains to scale.

Do not draw one million DOM/SVG cells or step through a million full video frames. Linear search uses a time-compressed mapping to exact progress states, labeled **“Accelerated simulation — not a runtime benchmark.”** Any real-time duration belongs to the presentation, not measured algorithm performance. Side-by-side screens must make different playback pacing explicit.

Sorted order permits safe elimination. Show at least one concrete comparison that justifies the discarded range. On unsorted data, demonstrate that this justification fails; do not imply merely changing a search mode sorts the data for free.

## 6. Components and data flow

Implementation plan will finalize exact file names; proposed ownership boundaries:

1. **Episode content**, under a new `workflows/video/binary-search-english/v1/` directory: approved English transcript/cue requests, storyboard, sources and operating README. No generated media, model weights or secrets in this directory.
2. **Deterministic trace module**, in a neutral local-video domain folder: pure search traces and large-array progress mapping. No DB, network, filesystem, Qwen or Remotion renderer dependencies.
3. **Voice-publication adapter**, local Node tooling: read and verify existing committed voice artifacts, combine publications in explicit cue order, copy only selected WAVs into a dedicated render input directory, derive one episode timeline and its provenance. Private Qwen roots stay outside repository/DATA_DIR as required by that tool.
4. **Remotion composition**, in a new episode-specific folder under `src/remotion/`: interval/array renderer, explanatory cards, counters and caption layer. No renderer/bundler, filesystem, pg, sharp or model imports inside its browser bundle. Reuse installed Geist fonts and repository conventions.
5. **Local render entrypoint**, separate from production workers: bundle selected media only, select composition with the same input props as renderMedia, render H.264/AAC MP4, export SRT and representative stills, write an evidence manifest. No enqueue, upload, or auto-regeneration.

Pipeline: reviewed transcript + storyboard → voice validation/preflight → explicitly authorized Qwen generation → read-only voice verification → verified adapter publication → low-cost still/segment review → full local render → visual/listening review → handoff.

No hidden “approve all” operation; technical completion does not grant editorial/listening approval.

## 7. Timing, audio and captions

- Preserve Qwen's actual sample rate and sample count. At 30 fps use ceil(sampleCount × 30 / sampleRate), retaining the voice tool's six leading and fifteen trailing frames per cue.
- Concatenate request publications using explicit offsets and a single ordered cue list. Reject duplicate/missing cue IDs, changed text, mismatched fps, fingerprints or hashes.
- Narration controls overall pacing. Place visual beats at declared offsets or fractions within a cue, with final visual review; do not describe those as measured word timestamps.
- English captions must show the exact approved spoken text, split into readable units. Cue-level SRT is acceptable only where readable; multi-sentence cues need smaller display segments with **estimated**, explicitly documented timing, not claimed forced alignment. Keep the same segmentation/timing in burn-in and SRT.
- Aim for at most two lines, approximately 42 characters per line and 20 characters per second. If narration/caption density cannot fit, revise the draft and seek any additional inference budget rather than cutting words or shrinking text to unreadability. These are adopted editorial guidelines, not a claim of Netflix certification or independently verified transcription.
- Keep captions away from interval bounds, pointers and counters. Distinguish active/rejected/found states with text or shapes as well as color. Design must remain readable at 720p playback.
- No background music, cloning, loudness mastering, resampling or time-stretching in this scope. Do not certify narration accuracy solely from supplied text or waveform validation.

## 8. Runtime boundaries and budgets

This spec proposes limits, **not an inference authorization**:

- One final episode; no image generation, paid API calls or auto-written LLM content requests.
- At most 48 new Qwen cue attempts across the whole episode, sequential, one initial attempt per approved cue. The final transcript can use fewer. A failed attempt consumes its allowance; do not repurpose the remaining total to silently retry it.
- Before inference, present exact final request files, total cues/words, model/voice and the requested finite attempt budget for explicit permission. Existing source model/venv remain unchanged; do not download or install if missing.
- CPU inference may be slow; report observed progress and elapsed time without promising a completion time based on old samples.
- Before full rendering, confirm the named new output directory and sufficient local capacity. Use a local draft segment/stills to catch layout issues; no deliberate crash/corruption experiments.
- One authorized full render of the assembled episode. Further full rerenders or new speech after review require stating the reason and scope; never loop indefinitely to improve quality.

Do not read or expose secrets while inspecting configuration. Do not start ComfyUI, app/worker or a public server merely to render a local composition. If a required binary/environment is missing or incompatible, stop and report the blocker.

## 9. Durability and error handling

Use new run/output directories; inspect any existing target before writing. Preserve all previous demos and artifact roots. No in-place overwrite of a final MP4, WAV, approved request, or committed publication.

Voice tool retains its existing lock/cache/attempt behavior. Unknown/partial speech outcomes require inspection and separate retry permission, not automatic inference. Verify fingerprints, WAV hashes and the voice completion records before assembling.

Episode manifest binds transcript/storyboard/source identities, ordered voice publication and WAV hashes, trace convention/content hash, composition/tool revision or source digest, Remotion version, total frames, output hashes and actual render status. A manifest is provenance, not independent evidence of mathematical or listening correctness.

Write incomplete video to a new draft name and only mark a render complete after the renderer returns success and media metadata is inspected. A crash leaves the draft and diagnostics; do not overwrite or claim success. Local render failure may be retried only within explicitly stated permission; it must never trigger new voice generation.

## 10. Verification and acceptance

No tests, test files, fixtures or mocks will be created or run without a separate explicit user request and approved test plan, per AGENTS.md.

Allowed implementation verification: source review, existing CLI validation/preflight/verify without inference, lint, TypeScript checking and build as applicable. Report actual commands/exits; do not turn a custom test harness into an “artifact check.” No runtime fault injection.

Acceptance is recorded in separate states:

1. **Content reviewed:** English script matches the supplied outline, math conventions are explicit, sources support the claims, no fabricated performance measurements.
2. **Static implementation checked:** record lint/type/build and artifact validation actually performed; unexercised recovery branches remain unverified.
3. **Voice generated / technically verified:** all approved cues committed and verified. Human listening remains pending unless genuinely performed.
4. **Rendered / metadata inspected:** H.264/AAC, 1920×1080, 30 fps, full duration measured and reported. No cut speech, substituted cue or fabricated timing.
5. **Visual review:** inspect the complete binary-search example and representative frames from every chapter, small and large traces, counter synchronization, captions, not-found ending and final frame. Report reviewed ranges and gaps honestly.
6. **Listening/editorial approval:** user reviews English intelligibility, full text/endings, no repetition/noise, pacing, teaching clarity and overall quality. Without full listening, label the deliverable a review draft rather than fully accepted.

Deliver MP4, SRT, English transcript, sources, representative stills and the provenance/acceptance manifest with local paths. No YouTube upload or public publication.

## 11. Approval sequence

1. User reviews this written spec and explicitly approves or requests changes.
2. Invoke superpowers:writing-plans; create the concrete implementation plan and ask for approval and execution method (Native or delegated work). Do not inherit execution selection from a previous project.
3. Implement only the approved local workflow and content artifacts, keeping unrelated checkout changes intact. Do not infer runtime budget from code approval.
4. Present final transcript and finite cue-generation budget for runtime permission, then produce a review draft under the approved run limits.
5. Handoff with actual completed and pending acceptance states.

No commit/push is authorized. Writing this document does not authorize code implementation, inference or migrations.

## 12. Sources and verification limits

Official sources consulted on 2026-11-01 after Context7 discovery returned no match:

- Princeton Algorithms, binary search on ordered input and halving: https://algs4.cs.princeton.edu/11model/ . The one-million/20 count is a mathematical consequence of the specified trace, not a published timing benchmark.
- Remotion renderMedia: https://www.remotion.dev/docs/renderer/render-media . Confirms composition/inputProps, local bundled rendering and H.264; current docs do not certify every behavior of pinned 4.0.537. Implementation must check installed types/source before using specific APIs.
- Qwen3-TTS official repository: https://github.com/QwenLM/Qwen3-TTS . Confirms CustomVoice English/Ryan, text/language/speaker/instruct and returned waveform/sample rate; no fixed-duration or CPU-throughput guarantee.

Local source anchors: `src/lib/algorithm/animation/schema.ts`, `src/lib/algorithm/voice/constants.ts`, `workflows/voice/qwen-english/v1/README.md`, `docs/superpowers/specs/2026-10-30-english-voice-workflow-design.md`, `src/worker/qwen-english-render.mjs`, package.json/package-lock.json and Dockerfile. Historical voice/model version records are not fresh runtime preflight results for this episode.
