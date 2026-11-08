import { sql } from "drizzle-orm";
import { ASSET_GENERATION_SIZES } from "../assets/generation-size";
import {
  type AnyPgColumn,
  type PgTableExtraConfigValue,
  bigint,
  boolean,
  check,
  foreignKey,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Trạng thái dùng chung cho mọi đối tượng cần duyệt (spec §4).
export const reviewStatus = pgEnum("review_status", [
  "draft",
  "generating",
  "pending_review",
  "approved",
  "rejected",
  "failed",
  "stale",
]);
export const assetKind = pgEnum("asset_kind", ["chr", "bg", "prop", "fx"]);
export const videoKind = pgEnum("video_kind", ["cartoon", "algorithm"]);
export const algorithmStage = pgEnum("algorithm_stage", ["problem", "solution", "combo", "script", "assets", "voice", "animation", "render", "done"]);
export const algorithmSource = pgEnum("algorithm_source", ["human", "llm"]);
export const algorithmRunStatus = pgEnum("algorithm_run_status", ["queued", "running", "waiting_review", "succeeded", "failed", "stale"]);
export const lessonStatus = pgEnum("lesson_status", ["proposed", "approved", "rejected", "retired"]);
export const voiceClipStatus = pgEnum("algorithm_voice_clip_status", ["generating", "ready", "failed"]);
export const algorithmAssetStatus = pgEnum("algorithm_asset_status", ["open", "generating", "pending_review", "bound", "dropped", "failed"]);
// Video đang ở bước nào của quy trình hoạt hình.
export const videoStatus = pgEnum("video_status", [
  // AI đề xuất asset, chờ người duyệt (spec ai-casting).
  "casting",
  "scripting",
  "storyboarding",
  "rendering",
  "uploading",
  "done",
]);
// Loại đối tượng mà validations, reviews, job_runs trỏ tới (tham chiếu đa hình, không có khóa ngoại).
export const targetType = pgEnum("target_type", [
  "automation_video",
  "audio_take",
  "voiceover_timeline",
  "asset",
  "asset_variant",
  "video",
  "script",
  "scene",
  "render",
  "upload",
  "algorithm_workflow",
  "algorithm_revision",
  "algorithm_output",
  "algorithm_generation_run",
  "playbook_lesson",
  "algorithm_workflow",
]);
export const reviewDecision = pgEnum("review_decision", ["approved", "rejected"]);
export const validationVerdict = pgEnum("validation_verdict", ["pass", "fail"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed"]);
export const privacyStatus = pgEnum("privacy_status", ["private", "unlisted", "public"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const channels = pgTable("channels", {
  id: id(),
  name: text("name").notNull().unique(),
  youtubeChannelId: text("youtube_channel_id").unique(),
  createdAt: createdAt(),
});

// Bộ phim hoạt hình: chỉ có tên. Sở hữu asset; mỗi design chọn đúng một bộ phim.
export const series = pgTable("series", {
  id: id(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

// Thư mục (composite): parent_id NULL = project gốc. Không xóa được khi còn node con.
export const projects = pgTable(
  "projects",
  {
    id: id(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => projects.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (t) => [
    // NULL khác nhau trong UNIQUE, nên tách hai chỉ mục từng phần: anh em cùng cha và project gốc.
    uniqueIndex("projects_sibling_name").on(t.parentId, t.name).where(sql`${t.parentId} IS NOT NULL`),
    uniqueIndex("projects_root_name").on(t.name).where(sql`${t.parentId} IS NULL`),
  ],
);

export const assets = pgTable(
  "assets",
  {
    id: id(),
    seriesId: uuid("series_id")
      .notNull()
      .references(() => series.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    kind: assetKind("kind").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    generationSize: text("generation_size"),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Tên duy nhất trong từng bộ phim (spec series-project-design §3).
    unique("assets_series_name").on(t.seriesId, t.name),
    // Chuẩn đặt tên: docs/standards/asset-naming.md
    check(
      "assets_name_format",
      sql`${t.name} ~ '^(chr|bg|prop|fx)_[a-z0-9]+(_[a-z0-9]+)*$' AND char_length(${t.name}) <= 40`,
    ),
    check("assets_name_matches_kind", sql`starts_with(${t.name}, ${t.kind}::text || '_')`),
    check("assets_generation_size_allowed", sql`${t.generationSize} IS NULL OR ${t.generationSize} IN (${sql.raw(ASSET_GENERATION_SIZES.map((entry) => `'${entry.value}'`).join(", "))})`),
  ],
);

export const assetVariants = pgTable(
  "asset_variants",
  {
    id: id(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // `base` = ảnh gốc đã duyệt. Danh sách trạng thái hợp lệ theo loại asset nằm ở chuẩn đặt tên, kiểm tra ở tầng app.
    state: text("state").notNull(),
    filePath: text("file_path"),
    width: integer("width"),
    height: integer("height"),
    sourceWidth: integer("source_width"),
    sourceHeight: integer("source_height"),
    prompt: text("prompt").notNull().default(""),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("asset_variants_asset_state").on(t.assetId, t.state),
    check("asset_variants_state_format", sql`${t.state} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
    check("asset_variants_source_size_valid", sql`(${t.sourceWidth} IS NULL AND ${t.sourceHeight} IS NULL) OR (${t.sourceWidth} IS NOT NULL AND ${t.sourceHeight} IS NOT NULL AND ${t.sourceWidth} > 0 AND ${t.sourceHeight} > 0)`),
    check(
      "asset_variants_size_positive",
      sql`(${t.width} IS NULL OR ${t.width} > 0) AND (${t.height} IS NULL OR ${t.height} > 0)`,
    ),
  ],
);

// Lát cắt đầu chỉ có một combo cố định; nội dung `definition` chốt ở M4 và spec combo/ACE.
export const combos = pgTable("combos", {
  id: id(),
  name: text("name").notNull().unique(),
  definition: jsonb("definition").notNull().default({}),
  createdAt: createdAt(),
});

export const videos = pgTable("videos", {
  id: id(),
  // Bảng videos giữ vai "bản thiết kế" (design): thuộc một bộ phim và nằm trong một project.
  seriesId: uuid("series_id")
    .notNull()
    .references(() => series.id, { onDelete: "restrict" }),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "restrict" }),
  // Có thể chưa chọn kênh khi mới tạo video; bắt buộc ở bước upload (M7).
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  brief: text("brief").notNull().default(""),
  comboId: uuid("combo_id").references(() => combos.id, { onDelete: "set null" }),
  // Mặc định giữ "scripting": Postgres cấm dùng giá trị enum mới thêm trong cùng transaction migration; app tự đặt "casting".
  kind: videoKind("kind").notNull().default("cartoon"),
  status: videoStatus("status").default("scripting"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t): PgTableExtraConfigValue[] => [
  unique("videos_id_kind").on(t.id, t.kind),
  check("videos_kind_status", sql`(${t.kind} = 'cartoon' AND ${t.status} IS NOT NULL) OR (${t.kind} = 'algorithm' AND ${t.status} IS NULL)`),
]);

export const scripts = pgTable(
  "scripts",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    // Khuôn JSON chốt ở plan M4.
    content: jsonb("content"),
    model: text("model"),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
  },
  (t) => [unique("scripts_video_version").on(t.videoId, t.version)],
);

export const scenes = pgTable(
  "scenes",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    scriptId: uuid("script_id")
      .notNull()
      .references(() => scripts.id, { onDelete: "cascade" }),
    // Thứ tự cảnh trong video ("order" là từ khóa SQL nên đặt tên position).
    position: integer("position").notNull(),
    // Khuôn JSON cảnh chốt ở plan M3.
    dsl: jsonb("dsl"),
    dslVersion: integer("dsl_version").notNull().default(1),
    durationFrames: integer("duration_frames"),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("scenes_script_position").on(t.scriptId, t.position)],
);

export const validations = pgTable(
  "validations",
  {
    id: id(),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    validatorModel: text("validator_model").notNull(),
    rubricVersion: text("rubric_version").notNull(),
    scores: jsonb("scores").notNull(),
    verdict: validationVerdict("verdict").notNull(),
    feedback: text("feedback").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("validations_target").on(t.targetType, t.targetId)],
);

export const reviews = pgTable(
  "reviews",
  {
    id: id(),
    targetType: targetType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    decision: reviewDecision("decision").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("reviews_target").on(t.targetType, t.targetId)],
);

export const audioTakes = pgTable("audio_takes", {
  id: id(), videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "restrict" }),
  source: text("source").notNull(), status: reviewStatus("status").notNull().default("draft"),
  label: text("label").notNull(), speakerRef: text("speaker_ref"), text: text("text"), modelMetadata: jsonb("model_metadata").$type<{ modelId: string; label: string }>(),
  filePath: text("file_path"), sha256: text("sha256"), bytes: bigint("bytes", { mode: "number" }), durationSeconds: doublePrecision("duration_seconds"),
  sampleRate: integer("sample_rate"), channels: integer("channels"), codec: text("codec"), requestId: uuid("request_id").notNull().unique(),
  synthesisStartedAt: timestamp("synthesis_started_at", { withTimezone: true }), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  index("audio_takes_video").on(t.videoId),
  check("audio_takes_source", sql`${t.source} IN ('upload','tts')`),
  check("audio_takes_tts_input", sql`${t.source} <> 'tts' OR (${t.text} IS NOT NULL AND char_length(${t.text}) BETWEEN 1 AND 5000 AND ${t.modelMetadata} IS NOT NULL)`),
  check("audio_takes_ready", sql`${t.status} NOT IN ('pending_review','approved') OR (${t.filePath} IS NOT NULL AND ${t.sha256} ~ '^[a-f0-9]{64}$' AND ${t.bytes} > 0 AND ${t.bytes} <= 26214400 AND ${t.durationSeconds} > 0 AND ${t.durationSeconds} <= 600 AND ${t.sampleRate} > 0 AND ${t.channels} > 0 AND ${t.codec} IS NOT NULL AND ${t.sha256} IS NOT NULL AND ${t.bytes} IS NOT NULL AND ${t.durationSeconds} IS NOT NULL AND ${t.sampleRate} IS NOT NULL AND ${t.channels} IS NOT NULL)`),
]);

export const voiceoverTimelines = pgTable("voiceover_timelines", {
  id: id(), videoId: uuid("video_id").notNull().references(() => videos.id, { onDelete: "restrict" }), version: integer("version").notNull(),
  content: jsonb("content").$type<import("../audio/types").VoiceoverTimelineV1>().notNull(), status: reviewStatus("status").notNull().default("draft"),
  visualFingerprint: text("visual_fingerprint").notNull(), contentHash: text("content_hash").notNull(), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [unique("voiceover_timelines_video_version").on(t.videoId, t.version), check("voiceover_timelines_version", sql`${t.version} > 0`)]);

export const renders = pgTable("renders", {
  voiceoverTimelineId: uuid("voiceover_timeline_id").references(() => voiceoverTimelines.id, { onDelete: "restrict" }),
  voiceoverSnapshotHash: text("voiceover_snapshot_hash"),
  id: id(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  filePath: text("file_path"),
  durationMs: integer("duration_ms"),
  status: reviewStatus("status").notNull().default("draft"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const uploads = pgTable("uploads", {
  id: id(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => videos.id, { onDelete: "cascade" }),
  channelId: uuid("channel_id")
    .notNull()
    .references(() => channels.id),
  youtubeVideoId: text("youtube_video_id"),
  privacyStatus: privacyStatus("privacy_status").notNull().default("private"),
  madeForKids: boolean("made_for_kids").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  status: jobStatus("status").notNull().default("queued"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const proposalKind = pgEnum("proposal_kind", ["asset", "variant"]);
export const proposalDecision = pgEnum("proposal_decision", ["open", "approved", "dropped"]);

// Đề xuất asset/biến thể của AI cho một design (spec ai-casting §4.2). Duyệt ảnh vẫn ở assets/asset_variants.
export const assetProposals = pgTable(
  "asset_proposals",
  {
    id: id(),
    videoId: uuid("video_id")
      .notNull()
      .references(() => videos.id, { onDelete: "cascade" }),
    kind: proposalKind("kind").notNull(),
    // Asset mới: id tạo trước, hàng assets chỉ có khi job sinh xong nên không có khóa ngoại.
    assetId: uuid("asset_id").notNull(),
    state: text("state").notNull(),
    brief: text("brief").notNull().default(""),
    reason: text("reason").notNull(),
    decision: proposalDecision("decision").notNull().default("open"),
    createdAt: createdAt(),
  },
  (t) => [unique("asset_proposals_video_asset_state").on(t.videoId, t.assetId, t.state)],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    jobType: text("job_type").notNull(),
    targetType: targetType("target_type"),
    targetId: uuid("target_id"),
    status: jobStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    // Model đã gọi, số token, thời gian chạy... (spec §8).
    metrics: jsonb("metrics").notNull().default({}),
    queueMsgId: bigint("queue_msg_id", { mode: "number" }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("job_runs_status").on(t.status),
    index("job_runs_target").on(t.targetType, t.targetId),
    index("job_runs_created_at").on(t.createdAt),
  ],
);

// Nội dung và lịch sử algorithm tách khỏi scripts/scenes/renders hoạt hình.
export const algorithmRevisions = pgTable("algorithm_revisions", {
  id: id(),
  videoId: uuid("video_id").notNull(),
  videoKind: videoKind("video_kind").notNull().default("algorithm"),
  stage: algorithmStage("stage").notNull(),
  version: integer("version").notNull(),
  contractVersion: integer("contract_version").notNull().default(1),
  content: jsonb("content").notNull(),
  source: algorithmSource("source").notNull(),
  status: reviewStatus("status").notNull().default("draft"),
  model: text("model"),
  promptVersion: text("prompt_version"),
  generationRunId: uuid("generation_run_id"),
  inputFingerprint: text("input_fingerprint").notNull(),
  createdAt: createdAt(),
}, (t): PgTableExtraConfigValue[] => [
  foreignKey({ columns: [t.videoId, t.videoKind], foreignColumns: [videos.id, videos.kind], name: "algorithm_revisions_video_kind_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.videoId, t.generationRunId], foreignColumns: [algorithmGenerationRuns.videoId, algorithmGenerationRuns.id], name: "algorithm_revisions_generation_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.videoId, t.stage, t.generationRunId], foreignColumns: [algorithmGenerationRuns.videoId, algorithmGenerationRuns.stage, algorithmGenerationRuns.id], name: "algorithm_revisions_run_stage_fk" }).onDelete("restrict"),
  unique("algorithm_revisions_video_stage_version").on(t.videoId, t.stage, t.version),
  unique("algorithm_revisions_video_id").on(t.videoId, t.id),
  unique("algorithm_revisions_video_stage_id").on(t.videoId, t.stage, t.id),
  check("algorithm_revisions_kind", sql`${t.videoKind} = 'algorithm'`),
  check("algorithm_revisions_stage", sql`${t.stage} NOT IN ('render', 'done')`),
  check("algorithm_revisions_versions", sql`${t.version} > 0 AND ${t.contractVersion} > 0`),
  check("algorithm_revisions_fingerprint", sql`${t.inputFingerprint} ~ '^[a-f0-9]{64}$'`),
]);

export const algorithmWorkflows = pgTable("algorithm_workflows", {
  videoId: uuid("video_id").primaryKey(),
  videoKind: videoKind("video_kind").notNull().default("algorithm"),
  stage: algorithmStage("stage").notNull().default("problem"),
  concurrencyVersion: integer("concurrency_version").notNull().default(1),
  activeProblemId: uuid("active_problem_id"),
  acceptedProblemId: uuid("accepted_problem_id"),
  activeSolutionId: uuid("active_solution_id"),
  acceptedSolutionId: uuid("accepted_solution_id"),
  activeComboId: uuid("active_combo_id"),
  acceptedComboId: uuid("accepted_combo_id"),
  activeScriptId: uuid("active_script_id"),
  acceptedScriptId: uuid("accepted_script_id"),
  activeAssetsId: uuid("active_assets_id"),
  acceptedAssetsId: uuid("accepted_assets_id"),
  activeVoiceId: uuid("active_voice_id"),
  acceptedVoiceId: uuid("accepted_voice_id"),
  activeAnimationId: uuid("active_animation_id"),
  acceptedAnimationId: uuid("accepted_animation_id"),
  activeOutputId: uuid("active_output_id"),
  acceptedOutputId: uuid("accepted_output_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t): PgTableExtraConfigValue[] => [
  foreignKey({ columns: [t.videoId, t.videoKind], foreignColumns: [videos.id, videos.kind], name: "algorithm_workflows_video_kind_fk" }).onDelete("restrict"),
  check("algorithm_workflows_kind", sql`${t.videoKind} = 'algorithm'`),
  check("algorithm_workflows_version", sql`${t.concurrencyVersion} > 0`),
  foreignKey({ columns: [t.videoId, t.activeOutputId], foreignColumns: [algorithmOutputs.videoId, algorithmOutputs.id], name: "algorithm_workflows_active_output_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.videoId, t.acceptedOutputId], foreignColumns: [algorithmOutputs.videoId, algorithmOutputs.id], name: "algorithm_workflows_accepted_output_fk" }).onDelete("restrict"),
  ...([
    ["active_problem", t.activeProblemId], ["accepted_problem", t.acceptedProblemId],
    ["active_solution", t.activeSolutionId], ["accepted_solution", t.acceptedSolutionId],
    ["active_combo", t.activeComboId], ["accepted_combo", t.acceptedComboId],
    ["active_script", t.activeScriptId], ["accepted_script", t.acceptedScriptId],
    ["active_assets", t.activeAssetsId], ["accepted_assets", t.acceptedAssetsId],
    ["active_voice", t.activeVoiceId], ["accepted_voice", t.acceptedVoiceId],
    ["active_animation", t.activeAnimationId], ["accepted_animation", t.acceptedAnimationId],
  ] as const).map(([name, column]) => foreignKey({ columns: [t.videoId, column], foreignColumns: [algorithmRevisions.videoId, algorithmRevisions.id], name: `algorithm_workflows_${name}_fk` }).onDelete("restrict")),
]);

export const algorithmRevisionInputs = pgTable("algorithm_revision_inputs", {
  id: id(),
  videoId: uuid("video_id").notNull(),
  revisionId: uuid("revision_id").notNull(),
  inputRevisionId: uuid("input_revision_id").notNull(),
}, (t): PgTableExtraConfigValue[] => [
  unique("algorithm_revision_inputs_edge").on(t.revisionId, t.inputRevisionId),
  foreignKey({ columns: [t.videoId, t.revisionId], foreignColumns: [algorithmRevisions.videoId, algorithmRevisions.id], name: "algorithm_revision_inputs_output_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.videoId, t.inputRevisionId], foreignColumns: [algorithmRevisions.videoId, algorithmRevisions.id], name: "algorithm_revision_inputs_input_fk" }).onDelete("restrict"),
  check("algorithm_revision_inputs_not_self", sql`${t.revisionId} <> ${t.inputRevisionId}`),
]);

export const algorithmGenerationRuns = pgTable("algorithm_generation_runs", {
  id: id(),
  videoId: uuid("video_id").notNull().references(() => algorithmWorkflows.videoId, { onDelete: "restrict" }),
  stage: algorithmStage("stage").notNull(),
  threadId: text("thread_id").notNull(),
  requestKey: text("request_key").notNull().unique(),
  inputSnapshot: jsonb("input_snapshot").notNull(),
  inputFingerprint: text("input_fingerprint").notNull(),
  status: algorithmRunStatus("status").notNull().default("queued"),
  interruptId: text("interrupt_id"),
  jobRunId: uuid("job_run_id").references(() => jobRuns.id, { onDelete: "restrict" }),
  model: text("model"),
  promptVersion: text("prompt_version"),
  contractVersion: integer("contract_version").notNull().default(1),
  metrics: jsonb("metrics").notNull().default({}),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t): PgTableExtraConfigValue[] => [
  unique("algorithm_generation_runs_video_id").on(t.videoId, t.id),
  unique("algorithm_generation_runs_video_stage_id").on(t.videoId, t.stage, t.id),
  index("algorithm_generation_runs_status").on(t.status),
  check("algorithm_generation_runs_fingerprint", sql`${t.inputFingerprint} ~ '^[a-f0-9]{64}$'`),
  check("algorithm_generation_runs_stage", sql`${t.stage} <> 'done'`),
]);

export const algorithmAssetRequests = pgTable("algorithm_asset_requests", {
  id: id(),
  videoId: uuid("video_id").notNull(),
  scriptRevisionId: uuid("script_revision_id").notNull(),
  scriptStage: algorithmStage("script_stage").notNull().default("script"),
  temporaryKey: text("temporary_key").notNull(),
  brief: text("brief").notNull(),
  status: algorithmAssetStatus("status").notNull().default("open"),
  assetId: uuid("asset_id").references(() => assets.id, { onDelete: "restrict" }),
  state: text("state"),
  reason: text("reason").notNull().default(""),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t): PgTableExtraConfigValue[] => [
  unique("algorithm_asset_requests_script_key").on(t.scriptRevisionId, t.temporaryKey),
  foreignKey({ columns: [t.videoId, t.scriptStage, t.scriptRevisionId], foreignColumns: [algorithmRevisions.videoId, algorithmRevisions.stage, algorithmRevisions.id], name: "algorithm_asset_requests_script_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.assetId, t.state], foreignColumns: [assetVariants.assetId, assetVariants.state], name: "algorithm_asset_requests_variant_fk" }).onDelete("restrict"),
  check("algorithm_asset_requests_script_stage", sql`${t.scriptStage} = 'script'`),
  check("algorithm_asset_requests_binding", sql`${t.status} <> 'bound' OR (${t.assetId} IS NOT NULL AND ${t.state} IS NOT NULL)`),
  check("algorithm_asset_requests_drop_reason", sql`${t.status} <> 'dropped' OR length(trim(${t.reason})) > 0`),
]);

export const algorithmOutputs = pgTable("algorithm_outputs", {
  id: id(),
  videoId: uuid("video_id").notNull(),
  animationRevisionId: uuid("animation_revision_id").notNull(),
  animationStage: algorithmStage("animation_stage").notNull().default("animation"),
  inputFingerprint: text("input_fingerprint").notNull(),
  rendererVersion: text("renderer_version").notNull(),
  assetManifest: jsonb("asset_manifest").notNull(),
  filePath: text("file_path").unique(),
  durationFrames: integer("duration_frames").notNull(),
  status: reviewStatus("status").notNull().default("generating"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t): PgTableExtraConfigValue[] => [
  unique("algorithm_outputs_video_id").on(t.videoId, t.id),
  foreignKey({ columns: [t.videoId, t.animationStage, t.animationRevisionId], foreignColumns: [algorithmRevisions.videoId, algorithmRevisions.stage, algorithmRevisions.id], name: "algorithm_outputs_animation_fk" }).onDelete("restrict"),
  check("algorithm_outputs_animation_stage", sql`${t.animationStage} = 'animation'`),
  check("algorithm_outputs_frames", sql`${t.durationFrames} BETWEEN 1 AND 5400`),
  check("algorithm_outputs_fingerprint", sql`${t.inputFingerprint} ~ '^[a-f0-9]{64}$'`),
]);

export const algorithmVoiceClips = pgTable("algorithm_voice_clips", {
  id: id(),
  videoId: uuid("video_id").notNull(),
  voiceRevisionId: uuid("voice_revision_id").notNull(),
  cueId: text("cue_id").notNull(),
  fingerprint: text("fingerprint").notNull(),
  status: voiceClipStatus("status").notNull().default("generating"),
  filePath: text("file_path"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t): PgTableExtraConfigValue[] => [
  unique("algorithm_voice_clips_revision_cue").on(t.voiceRevisionId, t.cueId),
  index("algorithm_voice_clips_fingerprint").on(t.videoId, t.fingerprint),
  // Không dùng literal enum 'voice' ở DEFAULT/CHECK: Drizzle chạy mọi migration chờ trong một transaction, nên giá trị enum vừa thêm chưa dùng được.
  // Ràng buộc stage = 'voice' nằm ở trigger algorithm_guard_voice_clip (migration custom).
  foreignKey({ columns: [t.videoId, t.voiceRevisionId], foreignColumns: [algorithmRevisions.videoId, algorithmRevisions.id], name: "algorithm_voice_clips_revision_fk" }).onDelete("restrict"),
  check("algorithm_voice_clips_fingerprint", sql`${t.fingerprint} ~ '^[a-f0-9]{64}$'`),
  check("algorithm_voice_clips_ready", sql`${t.status} <> 'ready' OR (${t.filePath} IS NOT NULL AND ${t.durationMs} IS NOT NULL AND ${t.durationMs} > 0)`),
]);

export const algorithmDecisions = pgTable("algorithm_decisions", {
  id: id(),
  videoId: uuid("video_id").notNull().references(() => algorithmWorkflows.videoId, { onDelete: "restrict" }),
  revisionId: uuid("revision_id"),
  outputId: uuid("output_id"),
  decision: reviewDecision("decision").notNull(),
  reason: text("reason").notNull().default(""),
  expectedFingerprint: text("expected_fingerprint").notNull(),
  createdAt: createdAt(),
}, (t): PgTableExtraConfigValue[] => [
  foreignKey({ columns: [t.videoId, t.revisionId], foreignColumns: [algorithmRevisions.videoId, algorithmRevisions.id], name: "algorithm_decisions_revision_fk" }).onDelete("restrict"),
  foreignKey({ columns: [t.videoId, t.outputId], foreignColumns: [algorithmOutputs.videoId, algorithmOutputs.id], name: "algorithm_decisions_output_fk" }).onDelete("restrict"),
  unique("algorithm_decisions_revision").on(t.revisionId),
  unique("algorithm_decisions_output").on(t.outputId),
  check("algorithm_decisions_target", sql`(${t.revisionId} IS NOT NULL) <> (${t.outputId} IS NOT NULL)`),
  check("algorithm_decisions_reject_reason", sql`${t.decision} <> 'rejected' OR length(trim(${t.reason})) > 0`),
  check("algorithm_decisions_fingerprint", sql`${t.expectedFingerprint} ~ '^[a-f0-9]{64}$'`),
]);

export const playbookLessons = pgTable("playbook_lessons", {
  id: id(),
  lessonKey: uuid("lesson_key").notNull().defaultRandom(),
  version: integer("version").notNull(),
  title: text("title").notNull(),
  stage: algorithmStage("stage").notNull(),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  seriesId: uuid("series_id").references(() => series.id, { onDelete: "restrict" }),
  content: jsonb("content").notNull(),
  status: lessonStatus("status").notNull().default("proposed"),
  reviewReason: text("review_reason").notNull().default(""),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t): PgTableExtraConfigValue[] => [
  unique("playbook_lessons_key_version").on(t.lessonKey, t.version),
  index("playbook_lessons_selection").on(t.stage, t.status, t.seriesId),
  check("playbook_lessons_version", sql`${t.version} > 0`),
  check("playbook_lessons_stage", sql`${t.stage} NOT IN ('problem', 'done')`),
  check("playbook_lessons_review", sql`${t.status} = 'proposed' OR ${t.reviewedAt} IS NOT NULL`),
  check("playbook_lessons_reject_reason", sql`${t.status} <> 'rejected' OR length(trim(${t.reviewReason})) > 0`),
]);

export const playbookLessonSources = pgTable("playbook_lesson_sources", {
  id: id(),
  lessonId: uuid("lesson_id").notNull().references(() => playbookLessons.id, { onDelete: "restrict" }),
  revisionId: uuid("revision_id").references(() => algorithmRevisions.id, { onDelete: "restrict" }),
  decisionId: uuid("decision_id").references(() => algorithmDecisions.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, (t): PgTableExtraConfigValue[] => [
  check("playbook_lesson_sources_target", sql`${t.revisionId} IS NOT NULL OR ${t.decisionId} IS NOT NULL`),
]);

export const generationPlaybookSnapshots = pgTable("generation_playbook_snapshots", {
  id: id(),
  generationRunId: uuid("generation_run_id").notNull().references(() => algorithmGenerationRuns.id, { onDelete: "restrict" }),
  lessonId: uuid("lesson_id").notNull().references(() => playbookLessons.id, { onDelete: "restrict" }),
  content: jsonb("content").notNull(),
  createdAt: createdAt(),
}, (t): PgTableExtraConfigValue[] => [unique("generation_playbook_snapshots_run_lesson").on(t.generationRunId, t.lessonId)]);

// Automation độc lập với videos.kind và các revision bài giảng.
export const automationProfiles = pgTable("automation_profiles", {
  key: integer("key").primaryKey().default(1),
  version: integer("version").notNull().default(1),
  config: jsonb("config").notNull(),
  updatedAt: updatedAt(),
}, (t) => [check("automation_profile_singleton", sql`${t.key} = 1`)]);

export const automationVideos = pgTable("automation_videos", {
  id: id(), brief: jsonb("brief").notNull(), profileSnapshot: jsonb("profile_snapshot").notNull(),
  lockVersion: integer("lock_version").notNull().default(1),
  stage: text("stage").notNull().default("brief"), state: text("state").notNull().default("draft"),
  researchId: uuid("research_id"), storyboardId: uuid("storyboard_id"), previewId: uuid("preview_id"), outputId: uuid("output_id"),
  archived: boolean("archived").notNull().default(false), error: text("error"), workLog: jsonb("work_log").notNull().default(sql`'[]'::jsonb`),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  check("automation_video_stage", sql`${t.stage} IN ('brief','research','storyboard','production','final','complete')`),
  check("automation_video_state", sql`${t.state} IN ('draft','queued','running','waiting_review','blocked','failed','idle')`),
]);

export const automationRevisions = pgTable("automation_revisions", {
  id: id(), videoId: uuid("video_id").notNull().references(() => automationVideos.id),
  kind: text("kind").notNull(), schemaVersion: integer("schema_version").notNull().default(1),
  sequence: integer("sequence").notNull(), parentId: uuid("parent_id").references((): AnyPgColumn => automationRevisions.id),
  content: jsonb("content").notNull(), hash: text("hash").notNull(),
  inputSnapshot: jsonb("input_snapshot").notNull(), stale: boolean("stale").notNull().default(false), createdAt: createdAt(),
}, (t) => [unique("automation_revision_owner").on(t.videoId, t.id), unique("automation_revision_sequence").on(t.videoId, t.kind, t.sequence), check("automation_revision_sequence_positive", sql`${t.sequence} > 0`), check("automation_revision_kind", sql`${t.kind} IN ('research','storyboard')`)]);

export const automationSources = pgTable("automation_sources", {
  id: id(), videoId: uuid("video_id").notNull().references(() => automationVideos.id),
  url: text("url").notNull(), title: text("title").notNull(), hash: text("hash").notNull(), filePath: text("file_path").notNull(),
  readAt: createdAt(),
});

export const automationOutputs = pgTable("automation_outputs", {
  id: id(), videoId: uuid("video_id").notNull().references(() => automationVideos.id),
  kind: text("kind").notNull(), status: text("status").notNull().default("generating"),
  manifest: jsonb("manifest").notNull(), hash: text("hash"), inputSnapshot: jsonb("input_snapshot").notNull(), createdAt: createdAt(),
}, (t) => [unique("automation_output_owner").on(t.videoId, t.id), check("automation_output_kind", sql`${t.kind} IN ('preview','audio','render','package')`), check("automation_output_status", sql`${t.status} IN ('generating','ready','stale','failed')`)]);

export const automationReviews = pgTable("automation_reviews", {
  id: id(), videoId: uuid("video_id").notNull().references(() => automationVideos.id),
  gate: integer("gate").notNull(), revisionId: uuid("revision_id"), outputId: uuid("output_id"),
  subjectHash: text("subject_hash").notNull(), decision: text("decision").notNull(), note: text("note").notNull(), createdAt: createdAt(),
}, (t) => [
  foreignKey({ columns: [t.videoId, t.revisionId], foreignColumns: [automationRevisions.videoId, automationRevisions.id] }),
  foreignKey({ columns: [t.videoId, t.outputId], foreignColumns: [automationOutputs.videoId, automationOutputs.id] }),
  check("automation_review_subject", sql`(${t.gate} IN (1,2) AND ${t.revisionId} IS NOT NULL AND ${t.outputId} IS NULL) OR (${t.gate} = 3 AND ${t.outputId} IS NOT NULL AND ${t.revisionId} IS NULL)`),
  check("automation_review_decision", sql`${t.decision} IN ('approved','rejected')`),
]);

export const automationRuns = pgTable("automation_runs", {
  id: id(), videoId: uuid("video_id").notNull().references(() => automationVideos.id),
  jobRunId: uuid("job_run_id").references(() => jobRuns.id), stage: text("stage").notNull(),
  status: text("status").notNull().default("queued"), requestKey: text("request_key").notNull(),
  inputSnapshot: jsonb("input_snapshot").notNull(), operations: jsonb("operations").notNull().default(sql`'{}'::jsonb`),
  permit: jsonb("permit").notNull(), error: text("error"), createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("automation_active_request").on(t.videoId, t.requestKey).where(sql`${t.status} IN ('queued','running')`),
  uniqueIndex("automation_one_active_run").on(t.videoId).where(sql`${t.status} IN ('queued','running')`),
  check("automation_run_stage", sql`${t.stage} IN ('research','storyboard','preview','audio','render','package')`),
  check("automation_run_status", sql`${t.status} IN ('queued','running','succeeded','stale','blocked','failed')`),
]);

export type JobRun = typeof jobRuns.$inferSelect;
