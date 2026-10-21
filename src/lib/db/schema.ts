import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
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
]);
export const assetKind = pgEnum("asset_kind", ["chr", "bg", "prop", "fx"]);
// Video đang ở bước nào của quy trình.
export const videoStatus = pgEnum("video_status", [
  "scripting",
  "storyboarding",
  "rendering",
  "uploading",
  "done",
]);
// Loại đối tượng mà validations, reviews, job_runs trỏ tới (tham chiếu đa hình, không có khóa ngoại).
export const targetType = pgEnum("target_type", [
  "asset",
  "asset_variant",
  "video",
  "script",
  "scene",
  "render",
  "upload",
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

export const assets = pgTable(
  "assets",
  {
    id: id(),
    name: text("name").notNull().unique(),
    kind: assetKind("kind").notNull(),
    displayName: text("display_name").notNull(),
    description: text("description").notNull().default(""),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Chuẩn đặt tên: docs/standards/asset-naming.md
    check(
      "assets_name_format",
      sql`${t.name} ~ '^(chr|bg|prop|fx)_[a-z0-9]+(_[a-z0-9]+)*$' AND char_length(${t.name}) <= 40`,
    ),
    check("assets_name_matches_kind", sql`starts_with(${t.name}, ${t.kind}::text || '_')`),
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
    prompt: text("prompt").notNull().default(""),
    status: reviewStatus("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("asset_variants_asset_state").on(t.assetId, t.state),
    check("asset_variants_state_format", sql`${t.state} ~ '^[a-z0-9]+(_[a-z0-9]+)*$'`),
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
  // Có thể chưa chọn kênh khi mới tạo video; bắt buộc ở bước upload (M7).
  channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  brief: text("brief").notNull().default(""),
  comboId: uuid("combo_id").references(() => combos.id, { onDelete: "set null" }),
  status: videoStatus("status").notNull().default("scripting"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

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

export const renders = pgTable("renders", {
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

export type JobRun = typeof jobRuns.$inferSelect;
