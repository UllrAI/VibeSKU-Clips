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
  BatchPlanConfig,
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

export const ugcBatchStatusEnum = pgEnum("ugc_batch_status", [
  "draft",
  "running",
  "completed",
  "cancelled",
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
    // Storefront link for the market the clip will be published in. Kept apart
    // from sourceUrl so a reference page is never exported as a shoppable link.
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

export const ugcBatches = pgTable(
  "ugc_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    accountTag: text("accountTag"),
    config: jsonb("config").$type<BatchPlanConfig>().notNull(),
    plannedCount: integer("plannedCount").notNull(),
    estimatedCredits: integer("estimatedCredits").notNull(),
    status: ugcBatchStatusEnum("status").notNull().default("draft"),
    // Why a run produced less than it planned, in the operator's words. Set by
    // the expansion job; null when everything the plan asked for was created.
    note: text("note"),
    taskRunId: uuid("taskRunId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userCreatedAtIdx: index("ugc_batches_userId_createdAt_idx").on(
      table.userId,
      table.createdAt.desc(),
    ),
  }),
);

export const ugcClips = pgTable(
  "ugc_clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: uuid("batchId")
      .notNull()
      .references(() => ugcBatches.id, { onDelete: "cascade" }),
    productId: uuid("productId")
      .notNull()
      .references(() => ugcProducts.id, { onDelete: "cascade" }),
    scriptId: uuid("scriptId").references(() => ugcScripts.id, {
      onDelete: "set null",
    }),
    talentId: uuid("talentId").references(() => ugcTalents.id, {
      onDelete: "set null",
    }),
    // Serial number printed on the export manifest, unique inside a batch.
    reference: text("reference").notNull(),
    locale: text("locale").notNull(),
    market: text("market").notNull(),
    accountTag: text("accountTag"),
    template: ugcScriptTemplateEnum("template").notNull(),
    status: ugcClipStatusEnum("status").notNull().default("pending"),
    taskRunId: uuid("taskRunId"),
    attempts: integer("attempts").notNull().default(0),
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
    regeneratedFrom: uuid("regeneratedFrom"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    batchIdx: index("ugc_clips_batchId_idx").on(table.batchId),
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
    groupBy: text("groupBy").notNull(),
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
    batchId: uuid("batchId"),
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
