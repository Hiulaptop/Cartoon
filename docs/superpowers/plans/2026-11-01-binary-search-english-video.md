# Binary Search English Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce one review-draft English Binary Search video, approximately eight minutes, with accurate simulations, Ryan narration, MP4, SRT, transcript and provenance.

**Architecture:** A local file-based workflow reuses the existing guarded Qwen voice tool without modification. A new verified-publication adapter combines voice requests into a frame timeline; a dedicated Remotion composition consumes that timeline and deterministic search traces. No app/DB integration or Comfy generation.

**Tech Stack:** TypeScript, React 19.1.0, Remotion/@remotion/* 4.0.537, existing Zod 4.6.7, existing Node/tsx and Python Qwen environment; Next 15.5.28 remains unchanged.

**Spec:** `docs/superpowers/specs/2026-11-01-binary-search-english-video-design.md` — approved in chat on 2026-11-01 with “duyệt spec”. The user selected Native execution in chat on 2026-11-01, then explicitly allowed official documentation/installed source in place of unavailable tools and chose the current checkout. Speech/render permission remains separate.

## Global Constraints

- 1920×1080, 30 fps; target acceptance band **7:30–8:30**, actual timing from audio samples, no time-stretch/truncation/idle padding.
- English narration, labels, titles and captions; Qwen Ryan only, existing local model and venv, no package/model/browser downloads or fallback.
- At most 48 cues/initial inference attempts across at most three requests; each request ≤24 cues; each cue ≤400 Unicode code points and ≤60 whitespace words. Explicit immutable IDs and seeds.
- Code implementation approval is not runtime permission. Exact transcript and finite speech budget require separate permission. One full render under separately stated permission; rerenders/retries need stated scope.
- Do not create, edit or run tests, test scripts, test fixtures or mocks. Replace skill-default TDD with source review, actual content validation and allowed static checks; no disguised custom test harness.
- No DB/queue calls, migrations, .env/compose/flags, app/service starts, Comfy calls, paid APIs, uploads, installs, commit or push.
- Preserve the dirty checkout and historical demos. No reset/stash or unrelated changes. All media outputs use new inspected directories.
- Private voice output outside repository/DATA_DIR; assembled review media stays local and is not automatically published.
- Current docs must be checked against installed APIs. Context7/understand-anything unavailable in current catalog: retry discovery before implementation; if still absent, disclose and obtain explicit permission to proceed using official documentation and targeted source reading. Plan approval alone must not silently waive a mandatory tool.
- Load dataviz before implementing interval/comparison visualizations; use the specified visual validation tools if proposing a separate HTML visual to the user, not as a substitute for the actual Remotion video.

## Review Focus

1. Duplicate or reordered cues across requests: reject rather than narrate missing/repeated sections (Task 3, production validation and source review).
2. Committed WAV/publication changed, locked or partially written: stop before copying/rendering, never regenerate (Task 3, existing read-only verify and manifest guards).
3. Inclusive-bound/off-by-one errors and empty interval: use one trace authority with explicit before/after states (Tasks 2 and 4, source review plus actual render-frame inspection).
4. Narration/captions too long or duration outside target: retain a draft and report, never force timing or silently omit text (Tasks 1, 3 and 6, actual content/timeline diagnostics).
5. Existing output directory, missing browser or incomplete full render: refuse overwrite/download and never publish success from a partial file (Tasks 5 and 6, preflight and completion records).

These are review/operational checks, not authorization to author tests or deliberately corrupt artifacts.

---

## File map

Create only these code/content units unless implementation discovery requires a scoped plan amendment:

| Path | Responsibility |
|---|---|
| `workflows/video/binary-search-english/v1/episode.json` | Versioned cue order, chapter labels, exact text, caption segments and visual beats |
| `workflows/video/binary-search-english/v1/voice-request-01.json` / `voice-request-02.json` | Two initial voice batches, ≤24 cues each; a third only if editorial grouping actually needs it, total still ≤48 |
| `workflows/video/binary-search-english/v1/transcript.md` | Human-readable English script with chapters and cue IDs |
| `workflows/video/binary-search-english/v1/sources.md` | Claim/source map and benchmark caveats |
| `workflows/video/binary-search-english/v1/README.md` | Operator commands, permissions, outputs and limitations |
| `workflows/video/binary-search-english/v1/acceptance.md` | Actual implementation/runtime/listening status |
| `src/lib/local-video/binary-search/contracts.ts` | Local content, prepared episode and timing types plus runtime schemas |
| `src/lib/local-video/binary-search/trace.ts` | Pure small/large binary traces and linear progress |
| `src/lib/local-video/binary-search/captions.ts` | Caption frame allocation, line wrapping and SRT formatting |
| `scripts/binary-search-video.mts` | CLI dispatch only, no implicit execution |
| `scripts/binary-search-video/content.ts` | Read episode/requests; content and semantic validation |
| `scripts/binary-search-video/prepare.ts` | Read-only voice verification, provenance verification and selected asset staging |
| `scripts/binary-search-video/render.ts` | Local bundle/stills/segment/full render and media evidence |
| `src/remotion/binary-search-english/index.tsx` | Register the dedicated composition |
| `src/remotion/binary-search-english/video.tsx` | Frame/cue routing, audio and captions |
| `src/remotion/binary-search-english/array-view.tsx` | Small array, bounds and pointer view |
| `src/remotion/binary-search-english/interval-view.tsx` | Million-item interval overview, zoom and counters |
| `src/remotion/binary-search-english/explanation-view.tsx` | Hook, halving table, sorted-data caveat and ending |

Update the approved spec status/plan link as documentation only. No production package script is necessary: invoke the local CLI with the installed tsx executable. Keep scripts excluded from the app tsconfig as they are now; validate the runtime CLI through its real content/preparation commands, not a new test runner.

## Pre-execution gate

- [ ] Retry Context7 and understand-anything discovery before implementing any task. If either remains unavailable, report the missing tool and obtain explicit permission to substitute official documentation and targeted installed-source review. No fake knowledge graph or implicit waiver from plan approval.

## Task 1: Author the English episode and validate its inputs

**Files:** content files from the map; `contracts.ts`, `scripts/binary-search-video/content.ts`, CLI entrypoint.

**Interfaces:**
- `EpisodeDefinitionSchema` → `EpisodeDefinition`: `{version:1,id:'binary-search-english-v1',title,chapters,cues}`.
- Cue: `{id,chapterId,text,captionSegments:string[],visual:{kind,example?,beats:VisualBeat[]}}`; kind is `hook|linear|small-search|large-search|halving|sorted-rule|not-found|closing`; example is `small-found|million-found|small-missing` where applicable.
- Beat: `{at:number,stateIndex:number,phase:'before'|'after'}` with at in [0,1), strictly increasing; stateIndex addresses Task 2 trace states. Non-search cards have no beats.
- `loadEpisode(packDir:string): Promise<{episode:EpisodeDefinition;requests:VoiceRequest[];contentHashes:Record<string,string>}>` validates actual files; throws a bounded diagnostic on any mismatch.
- CLI `validate --pack <directory>` prints cue/word totals, batch membership and validation status; performs no inference/output writes.

- [ ] Write approximately 1,000–1,200 words following the spec's five chapters; disclose that unsystematic guesses are not linear search. State “at most 20 positions checked” for one million, not twenty seconds or twenty machine instructions.
- [ ] Split into ≤48 short cues and two requests where possible. Use globally unique cue IDs, request IDs `binary-search-en-v1-01` and `binary-search-en-v1-02`, English/Ryan/fps30, explicit seeds `1101000 + ordinal` (one-based). Use engaging-hook for opening cues and clear-explainer thereafter; do not change voice settings.
- [ ] Supply editorial captionSegments that concatenate to exactly the normalized narration text (join with single spaces; require narration whitespace already canonical). Each segment wraps into at most two 42-character lines without deleting words; reject overlong unbreakable words. Keep segments short enough for the actual timing check later.
- [ ] Define runtime schemas with existing Zod and reject unknown keys, invalid chapters, duplicate IDs, unsupported visuals, mismatched request text/order, missing captions and voice limits. Do not store private paths in episode content.
- [ ] Implement `validate` for the real authored episode. Run it and existing Python `validate --request` for each real batch using the existing interpreter with `-I`; record actual output, not hypothetical expected success.
- [ ] Review transcript against Princeton source and storyboard. Present transcript paths and exact proposed inference count later at Task 6; do not run speech now.

**Deliverable gate:** coherent episode and valid real voice requests; no audio, no runtime approval assumed.

## Task 2: Implement deterministic traces and caption math

**Files:** `trace.ts`, `captions.ts`, shared types in `contracts.ts`.

**Interfaces:**
- `traceBinarySearch(length:number,valueAt:(index:number)=>number,target:number): SearchTrace` for validated sorted numeric examples. `SearchTrace={length,target,steps:SearchStep[],foundIndex:number|null}`; SearchStep records `{ordinal,lo,hi,mid,value,relation:'less'|'equal'|'greater',remainingBefore,nextLo,nextHi,remainingAfter}`. An equal step terminates with remainingAfter=1 and retains the found midpoint as next bounds; a miss ends with remainingAfter=0. No claim that equal “discards all possibilities.”
- `buildEpisodeTraces(): Record<'small-found'|'million-found'|'small-missing',SearchTrace>` uses precisely the spec's arrays/targets.
- `linearProgress(length:number,progress:number): {checked:number,currentIndex:number|null,found:boolean}` for the final-element target; clamped progress 0..1, checked=floor(progress×length), found only when checked=length. No million-state allocation.
- `allocateCaptions(segments:string[],from:number,audioFrames:number): Caption[]`, Caption `{from,to,text,lines:string[],timing:'estimated'}` with exclusive to, integer frames, contiguous partition of audio window; distribute by nonwhitespace character weights, deterministic remainder allocation; reject zero-length spans or density >20 characters/sec.
- `formatSrt(captions:Caption[],fps:30):string`, integer frame-to-ms rounding shared with on-screen caption data.

- [ ] Implement inclusive lo/hi midpoint trace and explicitly recorded before/after states; validate length/target/value numbers. Do not put DB/network/Remotion imports here.
- [ ] Implement main million-item trace lazily with valueAt(i)=i+1 and target 1,000,000; small target 91 and miss target 90 on the fixed 12-item array.
- [ ] Source-review main trace count=20 and small midpoint indexes 5→8→10→9, plus empty-interval miss. This is a reasoning review, not a new executable test file.
- [ ] Implement frame allocation/SRT and reject caption whitespace/text mismatch in content validation. Report estimated timing honestly; no ASR/word alignment claim.
- [ ] Run `npx tsc --noEmit`; record any baseline or introduced errors separately. No tests.

**Deliverable gate:** one pure authority for trace/caption state; frame-level correctness also inspected on real episode artifacts in Tasks 4–6.

## Task 3: Adapt verified voice publications without changing the voice tool

**Files:** `scripts/binary-search-video/prepare.ts`; prepared schemas in `contracts.ts`; CLI prepare dispatch.

**Interfaces:**
- CLI `prepare --pack <dir> --voice-root <private-dir> --python <existing-exe> --output <new-local-dir>`; no inference/model argument.
- `prepareEpisode(args:{packDir:string;voiceRoot:string;python:string;outputDir:string}):Promise<PreparedEpisode>`.
- PreparedEpisode `{version:1,id,title,fps:30,width:1920,height:1080,durationInFrames,cues:PreparedCue[],captions:Caption[],traces,provenance}`.
- PreparedCue `{id,chapterId,text,from,durationInFrames,audioStartFrame,audioFrames,src,wavSha256,fingerprint,visual}`. src is only `audio/<cueId>.wav` under the render input root.
- Output root contains `input/public/audio/`, selected Geist font under `input/public/fonts/`, `input/episode.json`, `input/provenance.json`. Subsequent rendering reads these, not the private voice cache directly.

- [ ] Preflight existing private voice root and existing Python executable with path arguments via spawn, no shell interpolation. Refuse linked/escaping artifact paths, active runner lock, unmarked or incomplete voice roots.
- [ ] For each expected request invoke the existing `python -I scripts/english_voice.py verify --output ... --request-id ...`, require exit 0. Do not import/load model or modify the voice code.
- [ ] Re-read complete.json, binding/request, publication manifest/timeline and their raw-file SHA-256 references. Use the Python authority for canonical request/identity verification; do not invent cross-language canonical-hash equivalence. Match exact request object, cue order/text, fingerprint, sample counts/rates and WAV hash to the verified publication. Recheck locks/completion/WAV hashes at copy boundary; operator must not mutate the voice root concurrently.
- [ ] Inspect target before writing: require absent output or a new empty directory; never adopt an unrelated nonempty root. Create and keep a preparation marker, stage copied audio with exclusive writes, verify bytes after copying. Publish input/episode.json last. On partial failure preserve the directory and stop; use a new directory for another preparation attempt rather than auto-cleaning.
- [ ] Offset each request timeline in explicit episode order, retain leading6/trailing15 frames, derive total frames using integer sample arithmetic. Reject duplicates, missing cues, unsafe src, timing/hash/text discrepancies, unsatisfied caption density or invalid visual beat indexes.
- [ ] Copy only a verified installed Geist font file; record its hash. Do not bundle the repository/private voice tree as publicDir. Record chapter boundary and duration diagnostics; outside 7:30–8:30 remains a draft, never stretch.

**Verification:** source-review all five Review Focus guards; before new speech, an actual existing publication may only be inspected through the existing read-only verify command if its path is known and no mutation is needed. Do not create fake publications. Real episode `prepare` is exercised only after Task 6 speech permission.

## Task 4: Build the landscape explanation composition

**Files:** six new Remotion files from the map.

**Interfaces:** `BinarySearchEnglishVideo({episode}:{episode:PreparedEpisode})`; composition ID `BinarySearchEnglish`, dynamic duration from episode, fixed 1920×1080/fps30. Views consume only prepared trace states/cue progress and layout props; no filesystem/renderer dependencies.

- [ ] Load dataviz skill before visual code. Establish a consistent high-contrast palette and semantic text/shape states; no claim that color alone conveys discarded/found status. Reserve a bottom caption zone with two readable lines.
- [ ] Register composition with valid empty editor-placeholder props that render a clear “prepared episode required” card, never invented narration or a fake completed episode. Production CLI must reject the placeholder.
- [ ] Implement audio as Sequence from audioStartFrame for audioFrames with Html5Audio/staticFile; use prepared sample timing and keep exact same timeline for SRT and captions.
- [ ] Implement array view with explicit indexes vs values, lo/mid/hi pointers and phase-selected candidate counts. Use the actual trace for found and missing examples, not hand-authored numbers.
- [ ] Implement large interval view with proportional bar, exact bounds/counts, minimum visible marker annotated when not to scale, and bounded local-neighborhood rendering. Linear progress uses Task 2 mapping and visibly says “Accelerated simulation — not a runtime benchmark.”
- [ ] Implement hook, halving table (2^19, 2^20), sorted-order counterexample and conclusion; keep logarithm notation after observed halving. Any side-by-side pacing differences must be labeled.
- [ ] Load copied Geist using FontFace/delayRender/continueRender/cancelRender, matching installed conventions; do not request Google fonts/network resources.
- [ ] Run lint and TypeScript check, then build if feasible in the current checkout; report failures without modifying unrelated baseline code. No test commands.

**Deliverable gate:** composition code and static diagnostics. Visual correctness remains pending real still/segment review, not inferred from build.

## Task 5: Add explicit local rendering and evidence commands

**Files:** `scripts/binary-search-video/render.ts`, CLI, workflow README/acceptance.

**Interfaces:**
- CLI subcommands `inspect --output <prepared-root>` (read-only), `stills --output ... --browser <existing-exe> --execute`, `segment --output ... --browser ... --chapter <id> --execute`, `render --output ... --browser ... --execute`.
- `inspectPreparedEpisode(root:string):Promise<PreparedEpisode>` verifies input/provenance and selected WAV/font hashes before bundle/render.
- Every renderer command creates a new dedicated attempt directory under output root; never replace a previous attempt or use private voice storage as publicDir.

- [ ] Verify the explicit existing Chrome executable, destination, input hashes, installed Remotion version and free disk space (Node fs.statfs; refuse <5 GiB as a conservative local guard, not a guarantee). Missing browser means blocked, never ensureBrowser/download.
- [ ] Bundle only the composition with prepared publicDir; use webpack alias if an actual @ import needs it. Select composition and render with identical inputProps. Keep concurrency=1.
- [ ] `stills` selects chapter starts, all small worked-example midpoint states, representative large interval states, empty interval and final frame. `segment` renders only the named actual chapter to a new draft path. No synthetic scenes or automatic regeneration.
- [ ] Full render settings: codec h264, audioCodec aac, audioBitrate 192k, pixelFormat yuv420p, crf20; preserve approved Remotion free-license convention. Stream progress without pretending future completion.
- [ ] Render to a draft file, inspect with installed renderer `getVideoMetadata` (available but deprecated in 4.0.537; intentionally no new dependency). Require h264/aac, dimensions/fps exact, duration within one frame of prepared duration; rename to episode.mp4 only after success and inspection, without replacing any existing destination.
- [ ] Export SRT from prepared captions; copy transcript and source notes to the review attempt. Record raw source/tool/content hashes, prepared inputs, actual metadata, output hashes and separate acceptance states. Write render-complete record last. Retain partial files on error and stop; no automatic rerender, voice fallback or upload.
- [ ] Write README with literal command syntax and permission boundaries; no production package script/dependency edits. Run real `validate` again, CLI help and lint/type/build as applicable; no runtime rendering before Task 6 permission.

## Task 6: Request bounded runtime permission and produce the review draft

**Files:** only new local runtime directories and acceptance records; editorial changes require updated immutable request IDs and appropriate renewed budget.

- [ ] Present final transcript, actual cue/word count, exact request files, Ryan/model identity, proposed inspected private root and max-new-cues per invocation; request permission for initial attempts only and one full render plus the named stills/one chapter preview. A generic code-plan approval does not consume this gate.
- [ ] After permission, inspect parent directories and existing interpreter/model/browser, run voice preflight with `-I` per real request. Report any runtime mismatch; do not fix environments/install models automatically.
- [ ] Run speech sequentially with `--execute --max-new-cues <exact-approved-batch-count>`. Use the tool's existing immutable/cache behavior. On failure stop and report cue ID, attempt status and spent count; request separate retry permission rather than spending another initial cue's allowance.
- [ ] Run existing verify on completed requests, then `prepare` to a new local root. Report actual duration and caption-density diagnostics. If content cannot meet the target, keep the draft and propose a bounded text/timing revision or explicit duration exception; no silent edits.
- [ ] Produce stills and the one approved real chapter preview. Inspect small-example steps, interval counts and captions at their actual frames; show preview paths to the user for review. Do not claim audio listened to if only metadata/screenshots were inspected.
- [ ] After layout/preview acceptance, perform the single approved full render, inspect metadata and record actual outputs. Run as a tracked background command if long; no polling loops or duplicate renders.
- [ ] Give MP4/SRT/transcript/source/manifest paths and actual duration; state full-listening/editorial approval pending unless genuinely obtained. Do not publish or upload.

## Task 7: Final independent review and truthful handoff

**Files:** documentation status only, plus in-scope fixes if approved limits allow them; no silent new inference/rerender.

- [ ] Run one independent review according to the user's execution-method choice, passing approved spec/plan, exact touched files and actual verification results. For Native, discover current T3 models/capabilities and use the most capable available reviewer as requested by the skill, no assumption that a catalog alias is available. Do not create a top-level thread for a child review.
- [ ] Verify findings against source; fix scoped code defects, rerun permitted static checks, and report any runtime artifact that remains from an older source revision. Never imply updated code has already updated MP4/audio.
- [ ] Update acceptance.md with actual source/static/inference/render/visual/listening states and tool limitations. No invented UI/runtime certification.
- [ ] Handoff local artifact links and remaining approvals. No commits/pushes unless the user separately requests them.

## Commands and sources checked while planning

- Existing Python CLI/store verified by reading `scripts/english_voice.py` and `scripts/english_voice/store.py`: validate/preflight/run/verify, max-new-cues 0..24, complete.json binds publication hashes; existing verify reconstructs timeline/commit checks.
- Existing tsconfig excludes scripts, includes src TypeScript/TSX; no tsconfig edits planned.
- Official https://www.remotion.dev/docs/renderer/render-media and https://www.remotion.dev/docs/audio support H.264/local audio approach. Installed `@remotion/renderer/dist/get-video-metadata.d.ts` and compositor metadata types confirm the proposed local metadata fields; installed existing composition demonstrates Sequence/Html5Audio and dynamic metadata.
- Official Qwen repository https://github.com/QwenLM/Qwen3-TTS and Princeton https://algs4.cs.princeton.edu/11model/ remain the voice/algorithm authorities from the approved spec.
- No tests, inference, render, service start or migration was performed while writing this plan.

## Plan self-review and approval

Spec coverage: editorial/trace constraints in Tasks 1–2; guarded voice adapter/timing in Task 3; rendering/captions/accessibility in Tasks 4–5; exact runtime gates/draft acceptance in Task 6; review/provenance/handoff in Task 7. Shared types and CLI names above are the interface authority. No test/commit steps from generic skill templates apply under AGENTS.md.

Status: **Native execution selected by the user on 2026-11-01; source implemented and independently reviewed**. One source-review fix pass addressed four Important findings; actual audio/preparation/render verification is still pending. Generation/render permission remains a later explicit gate; implementation progress and evidence are recorded in `.superpowers/sdd/2026-11-01-binary-search-english-video/progress.md`.
