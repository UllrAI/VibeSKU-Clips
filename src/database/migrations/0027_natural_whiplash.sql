CREATE TYPE "public"."ugc_batch_status" AS ENUM('draft', 'running', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ugc_clip_status" AS ENUM('pending', 'scripting', 'rendering', 'reviewing', 'ready', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ugc_product_status" AS ENUM('draft', 'analyzing', 'ready', 'needs_input', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ugc_review_status" AS ENUM('pending', 'selected', 'shortlisted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ugc_script_status" AS ENUM('draft', 'ready', 'locked');--> statement-breakpoint
CREATE TYPE "public"."ugc_script_template" AS ENUM('spokesperson', 'scenario', 'tutorial');--> statement-breakpoint
CREATE TYPE "public"."ugc_talent_source" AS ENUM('uploaded', 'generated');--> statement-breakpoint
CREATE TYPE "public"."ugc_usage_kind" AS ENUM('analysis', 'script', 'render', 'retry', 'regenerate');--> statement-breakpoint
CREATE TABLE "ugc_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"accountTag" text,
	"config" jsonb NOT NULL,
	"plannedCount" integer NOT NULL,
	"estimatedCredits" integer NOT NULL,
	"status" "ugc_batch_status" DEFAULT 'draft' NOT NULL,
	"taskRunId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"batchId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"scriptId" uuid,
	"talentId" uuid,
	"reference" text NOT NULL,
	"locale" text NOT NULL,
	"market" text NOT NULL,
	"accountTag" text,
	"template" "ugc_script_template" NOT NULL,
	"status" "ugc_clip_status" DEFAULT 'pending' NOT NULL,
	"taskRunId" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"videoUrl" text,
	"coverUrl" text,
	"subtitleUrl" text,
	"publishCaption" text,
	"durationMs" integer,
	"quality" jsonb,
	"failureReason" text,
	"similarityKey" text,
	"reviewStatus" "ugc_review_status" DEFAULT 'pending' NOT NULL,
	"reviewNote" text,
	"regeneratedFrom" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"groupBy" text NOT NULL,
	"clipCount" integer NOT NULL,
	"unmatchedCount" integer DEFAULT 0 NOT NULL,
	"manifest" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"sourceUrl" text,
	"shopUrl" text,
	"variant" text,
	"market" text,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"brief" jsonb,
	"facts" jsonb,
	"status" "ugc_product_status" DEFAULT 'draft' NOT NULL,
	"issue" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"productId" uuid NOT NULL,
	"template" "ugc_script_template" NOT NULL,
	"locale" text NOT NULL,
	"market" text NOT NULL,
	"title" text NOT NULL,
	"hook" text NOT NULL,
	"beats" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voiceover" text NOT NULL,
	"captions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"publishCaption" text,
	"disclosure" text,
	"status" "ugc_script_status" DEFAULT 'ready' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"parentId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_talents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"source" "ugc_talent_source" NOT NULL,
	"imageUrl" text,
	"prompt" text,
	"licenceNote" text,
	"voicePreset" text,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"batchId" uuid,
	"clipId" uuid,
	"kind" "ugc_usage_kind" NOT NULL,
	"credits" integer NOT NULL,
	"note" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ugc_batches" ADD CONSTRAINT "ugc_batches_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_batchId_ugc_batches_id_fk" FOREIGN KEY ("batchId") REFERENCES "public"."ugc_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_productId_ugc_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."ugc_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_scriptId_ugc_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."ugc_scripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_talentId_ugc_talents_id_fk" FOREIGN KEY ("talentId") REFERENCES "public"."ugc_talents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_exports" ADD CONSTRAINT "ugc_exports_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_products" ADD CONSTRAINT "ugc_products_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_scripts" ADD CONSTRAINT "ugc_scripts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_scripts" ADD CONSTRAINT "ugc_scripts_productId_ugc_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."ugc_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_talents" ADD CONSTRAINT "ugc_talents_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_usage_events" ADD CONSTRAINT "ugc_usage_events_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ugc_batches_userId_createdAt_idx" ON "ugc_batches" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ugc_clips_batchId_idx" ON "ugc_clips" USING btree ("batchId");--> statement-breakpoint
CREATE INDEX "ugc_clips_userId_reviewStatus_idx" ON "ugc_clips" USING btree ("userId","reviewStatus");--> statement-breakpoint
CREATE INDEX "ugc_clips_userId_createdAt_idx" ON "ugc_clips" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ugc_clips_userId_similarityKey_idx" ON "ugc_clips" USING btree ("userId","similarityKey");--> statement-breakpoint
CREATE INDEX "ugc_exports_userId_createdAt_idx" ON "ugc_exports" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ugc_products_userId_createdAt_idx" ON "ugc_products" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ugc_scripts_userId_createdAt_idx" ON "ugc_scripts" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ugc_scripts_productId_idx" ON "ugc_scripts" USING btree ("productId");--> statement-breakpoint
CREATE INDEX "ugc_talents_userId_createdAt_idx" ON "ugc_talents" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ugc_usage_events_userId_createdAt_idx" ON "ugc_usage_events" USING btree ("userId","createdAt" DESC NULLS LAST);