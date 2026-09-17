import {
  type AnyPgColumn,
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  uuid,
  index,
  uniqueIndex,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./schema";
import type {
  ClipQualityReport,
  CloneBlueprint,
  ReferenceFrameRecord,
  ProductBrief,
  ProductFacts,
  ScriptBeat,
} from "@/lib/ugc/types";

export const ugcProductStatusEnum = pgEnum("ugc_product_status", [
  "draft",
  "analyzing",
  "review",
  "ready",
  "needs_input",
  "failed",
]);

export const ugcTalentStatusEnum = pgEnum("ugc_talent_status", [
  "generating",
  "ready",
  "failed",
]);

export const ugcReferenceStatusEnum = pgEnum("ugc_reference_status", [
  "pending",
  "ingesting",
  "analyzing",
  "review",
  "ready",
  "failed",
]);

export const ugcReferenceSourceEnum = pgEnum("ugc_reference_source", [
  "upload",
  "url",
]);

export const ugcScriptTemplateEnum = pgEnum("ugc_script_template", [
  "spokesperson",
  "scenario",
  "tutorial",
]);

export const ugcScriptStatusEnum = pgEnum("ugc_script_status", [
  "draft",
  "ready",
  "locked",
]);

/**
 * A work walks these steps in order and stops on each one for a person. The
 * step is where it is; `ugcWorkStepStatusEnum` is what that step is doing.
 */
export const ugcWorkStepEnum = pgEnum("ugc_work_step", [
  "product",
  "script",
  "storyboard",
  "video",
  "done",
]);

export const ugcWorkStepStatusEnum = pgEnum("ugc_work_step_status", [
  "idle",
  "running",
  "review",
  "failed",
]);

export const ugcVideoModeEnum = pgEnum("ugc_video_mode", [
  "one_take",
  "storyboard",
]);

export const ugcAudioModeEnum = pgEnum("ugc_audio_mode", ["native", "tts"]);

export const ugcSegmentStatusEnum = pgEnum("ugc_segment_status", [
  "pending",
  "generating",
  "transcribing",
  "ready",
  "failed",
]);

export const ugcCompositionStatusEnum = pgEnum("ugc_composition_status", [
  "pending",
  "running",
  "ready",
  "failed",
]);

export const ugcVideoAspectRatioEnum = pgEnum("ugc_video_aspect_ratio", [
  "9:16",
  "16:9",
]);

export const ugcVideoResolutionEnum = pgEnum("ugc_video_resolution", [
  "480p",
  "720p",
  "1080p",
  "2k",
]);

export const ugcVideoModelEnum = pgEnum("ugc_video_model", [
  "h3",
  "seedance-2.0",
  "seedance-2.5",
]);

export const ugcFrameStatusEnum = pgEnum("ugc_frame_status", [
  "pending",
  "generating",
  "ready",
  "failed",
]);

export const ugcClipStatusEnum = pgEnum("ugc_clip_status", [
  "pending",
  "scripting",
  "rendering",
  "reviewing",
  "ready",
  "failed",
  "cancelled",
]);

export const ugcUsageKindEnum = pgEnum("ugc_usage_kind", [
  "analysis",
  "script",
  "render",
  "retry",
  "regenerate",
]);

export const ugcProducts = pgTable(
  "ugc_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sourceUrl: text("sourceUrl"),
    // Variant of the product shown in this work; publishing links stay outside
    // the product model.
    variant: text("variant"),
    market: text("market"),
    images: jsonb("images").$type<string[]>().notNull().default([]),
    brief: jsonb("brief").$type<ProductBrief | null>(),
    facts: jsonb("facts").$type<ProductFacts | null>(),
    status: ugcProductStatusEnum("status").notNull().default("draft"),
    issue: text("issue"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_products_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  }),
);

/**
 * A reference video the operator wants their own version of.
 *
 * It holds the material a clone is read from — the archived video, its
 * word-timed transcript, and the blueprint an analysis produced — and nothing
 * about any particular work. One reference can seed many clips, the way one
 * product can.
 */
export const ugcReferences = pgTable(
  "ugc_references",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    source: ugcReferenceSourceEnum("source").notNull(),
    /** Where a fetched reference came from; null for an upload. */
    sourceUrl: text("sourceUrl"),
    /**
     * When the operator stated they hold the rights to use this material.
     * Fetching someone's video is their call to make, and the record of that
     * statement belongs with the material rather than in a log.
     */
    rightsAcknowledgedAt: timestamp("rightsAcknowledgedAt", {
      withTimezone: true,
    }).notNull(),
    videoUrl: text("videoUrl"),
    durationMs: integer("durationMs"),
    aspectRatio: text("aspectRatio"),
    locale: text("locale").notNull().default("en"),
    /**
     * Stills sampled across the reference, in time order. They are what the
     * analysis actually looks at, and keeping them means a retried analysis
     * does not re-download and re-decode the video.
     */
    frames: jsonb("frames").$type<ReferenceFrameRecord[]>(),
    asrTaskId: text("asrTaskId"),
    transcript: text("transcript"),
    words: jsonb("words").$type<TranscriptWord[]>(),
    blueprint: jsonb("blueprint").$type<CloneBlueprint | null>(),
    status: ugcReferenceStatusEnum("status").notNull().default("pending"),
    /** The run whose error code the console reads this reference's failure from. */
    taskRunId: uuid("taskRunId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_references_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  }),
);

export const ugcTalents = pgTable(
  "ugc_talents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    referenceImages: jsonb("referenceImages")
      .$type<string[]>()
      .notNull()
      .default([]),
    imageUrl: text("imageUrl"),
    // Expanded photography prompt used to create the final reference image.
    prompt: text("prompt"),
    status: ugcTalentStatusEnum("status").notNull().default("ready"),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_talents_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  }),
);

export const ugcScripts = pgTable(
  "ugc_scripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("productId")
      .notNull()
      .references(() => ugcProducts.id, { onDelete: "cascade" }),
    template: ugcScriptTemplateEnum("template").notNull(),
    locale: text("locale").notNull(),
    market: text("market").notNull(),
    title: text("title").notNull(),
    hook: text("hook").notNull(),
    productionPrompt: text("productionPrompt"),
    beats: jsonb("beats").$type<ScriptBeat[]>().notNull().default([]),
    voiceover: text("voiceover").notNull(),
    captions: jsonb("captions").$type<string[]>().notNull().default([]),
    publishCaption: text("publishCaption"),
    disclosure: text("disclosure"),
    status: ugcScriptStatusEnum("status").notNull().default("ready"),
    version: integer("version").notNull().default(1),
    // Set when a script is localised, edited, or reused across products so the
    // origin stays traceable instead of being overwritten in place.
    parentId: uuid("parentId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_scripts_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    productIdx: index("ugc_scripts_productId_idx").on(table.productId),
  }),
);

export const ugcClips = pgTable(
  "ugc_clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("productId")
      .notNull()
      .references(() => ugcProducts.id, { onDelete: "cascade" }),
    scriptId: uuid("scriptId").references(() => ugcScripts.id, {
      onDelete: "set null",
    }),
    talentId: uuid("talentId").references(() => ugcTalents.id, {
      onDelete: "set null",
    }),
    workId: uuid("workId").references((): AnyPgColumn => ugcWorks.id, {
      onDelete: "cascade",
    }),
    version: integer("version").notNull().default(1),
    // Stable serial number shown beside the generated work.
    reference: text("reference").notNull(),
    locale: text("locale").notNull(),
    market: text("market").notNull(),
    template: ugcScriptTemplateEnum("template").notNull(),
    videoModel: ugcVideoModelEnum("videoModel").notNull().default("h3"),
    aspectRatio: ugcVideoAspectRatioEnum("aspectRatio")
      .notNull()
      .default("9:16"),
    resolution: ugcVideoResolutionEnum("resolution").notNull().default("720p"),
    durationSeconds: integer("durationSeconds").notNull().default(15),
    audioMode: ugcAudioModeEnum("audioMode").notNull().default("native"),
    status: ugcClipStatusEnum("status").notNull().default("pending"),
    videoUrl: text("videoUrl"),
    coverUrl: text("coverUrl"),
    subtitleUrl: text("subtitleUrl"),
    publishCaption: text("publishCaption"),
    durationMs: integer("durationMs"),
    quality: jsonb("quality").$type<ClipQualityReport | null>(),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_clips_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    workVersionIdx: uniqueIndex("ugc_clips_workId_version_idx").on(
      table.workId,
      table.version,
    ),
  }),
);

export const ugcUsageEvents = pgTable(
  "ugc_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clipId: uuid("clipId"),
    kind: ugcUsageKindEnum("kind").notNull(),
    credits: integer("credits").notNull(),
    note: text("note"),
    sourceKey: text("sourceKey"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_usage_events_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    sourceKeyIdx: uniqueIndex("ugc_usage_events_sourceKey_idx").on(
      table.sourceKey,
    ),
  }),
);

/**
 * One clip produced step by step, with a person confirming each step before
 * the next one spends anything. A work reuses the product, script and clip
 * tables rather than keeping a private copy of any of them.
 */
export const ugcWorks = pgTable(
  "ugc_works",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    step: ugcWorkStepEnum("step").notNull().default("product"),
    stepStatus: ugcWorkStepStatusEnum("stepStatus").notNull().default("idle"),
    productId: uuid("productId").references(() => ugcProducts.id, {
      onDelete: "set null",
    }),
    talentId: uuid("talentId").references(() => ugcTalents.id, {
      onDelete: "set null",
    }),
    /** Set when this work is a clone; its blueprint shapes the script. */
    referenceId: uuid("referenceId").references(() => ugcReferences.id, {
      onDelete: "set null",
    }),
    locale: text("locale").notNull().default("en"),
    market: text("market").notNull().default("US"),
    template: ugcScriptTemplateEnum("template")
      .notNull()
      .default("spokesperson"),
    videoMode: ugcVideoModeEnum("videoMode").notNull().default("one_take"),
    videoModel: ugcVideoModelEnum("videoModel").notNull().default("h3"),
    aspectRatio: ugcVideoAspectRatioEnum("aspectRatio")
      .notNull()
      .default("9:16"),
    resolution: ugcVideoResolutionEnum("resolution").notNull().default("720p"),
    durationSeconds: integer("durationSeconds").notNull().default(15),
    audioMode: ugcAudioModeEnum("audioMode").notNull().default("native"),
    scriptId: uuid("scriptId").references(() => ugcScripts.id, {
      onDelete: "set null",
    }),
    clipId: uuid("clipId").references(() => ugcClips.id, {
      onDelete: "set null",
    }),
    taskRunId: uuid("taskRunId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_works_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  }),
);

/**
 * One storyboard key frame. The frames are the operator's last cheap chance to
 * change what the clip looks like: they are generated from the script beats,
 * can be reworded and regenerated individually, and are then handed to the
 * video model together as its reference set.
 */
export const ugcWorkFrames = pgTable(
  "ugc_work_frames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("workId")
      .notNull()
      .references(() => ugcWorks.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    prompt: text("prompt").notNull(),
    imageUrl: text("imageUrl"),
    status: ugcFrameStatusEnum("status").notNull().default("pending"),
    /** The provider's own task id, so a poll can resume after a restart. */
    providerTaskId: text("providerTaskId"),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workPositionIdx: index("ugc_work_frames_workId_position_idx").on(
      table.workId,
      table.position,
    ),
  }),
);

/** Stable shot positions. Each replacement creates a new take. */
export const ugcWorkSegments = pgTable(
  "ugc_work_segments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("workId")
      .notNull()
      .references(() => ugcWorks.id, { onDelete: "cascade" }),
    scriptId: uuid("scriptId")
      .notNull()
      .references(() => ugcScripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startMs: integer("startMs").notNull(),
    endMs: integer("endMs").notNull(),
    activeTakeId: uuid("activeTakeId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workScriptPositionIdx: uniqueIndex(
      "ugc_segments_work_script_position_idx",
    ).on(table.workId, table.scriptId, table.position),
  }),
);

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

/** Provider task state and archived media for one shot attempt. */
export const ugcWorkTakes = pgTable(
  "ugc_work_takes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    segmentId: uuid("segmentId")
      .notNull()
      .references(() => ugcWorkSegments.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: ugcSegmentStatusEnum("status").notNull().default("pending"),
    videoTaskId: text("videoTaskId"),
    taskRunId: uuid("taskRunId"),
    asrTaskId: text("asrTaskId"),
    videoUrl: text("videoUrl"),
    audioUrl: text("audioUrl"),
    words: jsonb("words").$type<TranscriptWord[]>(),
    transcript: text("transcript"),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    segmentVersionIdx: uniqueIndex("ugc_takes_segment_version_idx").on(
      table.segmentId,
      table.version,
    ),
  }),
);

/** An immutable selection of takes used to produce one final clip version. */
export const ugcCompositions = pgTable(
  "ugc_compositions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workId: uuid("workId")
      .notNull()
      .references(() => ugcWorks.id, { onDelete: "cascade" }),
    scriptId: uuid("scriptId")
      .notNull()
      .references(() => ugcScripts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    takeIds: jsonb("takeIds").$type<string[]>().notNull(),
    status: ugcCompositionStatusEnum("status").notNull().default("pending"),
    taskRunId: uuid("taskRunId"),
    clipId: uuid("clipId").references(() => ugcClips.id, {
      onDelete: "set null",
    }),
    failureReason: text("failureReason"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    workVersionIdx: uniqueIndex("ugc_compositions_work_version_idx").on(
      table.workId,
      table.version,
    ),
  }),
);
