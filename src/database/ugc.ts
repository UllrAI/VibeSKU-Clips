import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  uuid,
  index,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { users } from "./schema";
import type {
  ClipQualityReport,
  ProductBrief,
  ProductFacts,
  ScriptBeat,
  ExportManifest,
} from "@/lib/ugc/types";

export const ugcProductStatusEnum = pgEnum("ugc_product_status", [
  "draft",
  "analyzing",
  "ready",
  "needs_input",
  "failed",
]);

export const ugcTalentSourceEnum = pgEnum("ugc_talent_source", [
  "uploaded",
  "generated",
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

export const ugcReviewStatusEnum = pgEnum("ugc_review_status", [
  "pending",
  "selected",
  "shortlisted",
  "rejected",
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

export const ugcTalents = pgTable(
  "ugc_talents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: ugcTalentSourceEnum("source").notNull(),
    imageUrl: text("imageUrl"),
    prompt: text("prompt"),
    // Free-form record of where the likeness came from and what it may be used
    // for. Voice cloning is never implied by an image licence.
    licenceNote: text("licenceNote"),
    voicePreset: text("voicePreset"),
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
    // Stable serial number printed on the export manifest.
    reference: text("reference").notNull(),
    locale: text("locale").notNull(),
    market: text("market").notNull(),
    template: ugcScriptTemplateEnum("template").notNull(),
    status: ugcClipStatusEnum("status").notNull().default("pending"),
    videoUrl: text("videoUrl"),
    coverUrl: text("coverUrl"),
    subtitleUrl: text("subtitleUrl"),
    publishCaption: text("publishCaption"),
    durationMs: integer("durationMs"),
    quality: jsonb("quality").$type<ClipQualityReport | null>(),
    failureReason: text("failureReason"),
    similarityKey: text("similarityKey"),
    reviewStatus: ugcReviewStatusEnum("reviewStatus")
      .notNull()
      .default("pending"),
    reviewNote: text("reviewNote"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userReviewIdx: index("ugc_clips_userId_reviewStatus_idx").on(
      table.userId,
      table.reviewStatus,
    ),
    userCreatedAtIdx: index("ugc_clips_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
    similarityIdx: index("ugc_clips_userId_similarityKey_idx").on(
      table.userId,
      table.similarityKey,
    ),
  }),
);

export const ugcExports = pgTable(
  "ugc_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    clipCount: integer("clipCount").notNull(),
    manifest: jsonb("manifest").$type<ExportManifest>().notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_exports_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
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
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_usage_events_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
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
    locale: text("locale").notNull().default("en"),
    market: text("market").notNull().default("US"),
    template: ugcScriptTemplateEnum("template")
      .notNull()
      .default("spokesperson"),
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
