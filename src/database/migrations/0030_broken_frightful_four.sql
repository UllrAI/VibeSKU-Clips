CREATE TYPE "public"."ugc_frame_status" AS ENUM('pending', 'generating', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ugc_work_step" AS ENUM('product', 'script', 'storyboard', 'video', 'done');--> statement-breakpoint
CREATE TYPE "public"."ugc_work_step_status" AS ENUM('idle', 'running', 'review', 'failed');--> statement-breakpoint
CREATE TABLE "ugc_work_frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workId" uuid NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	"imageUrl" text,
	"status" "ugc_frame_status" DEFAULT 'pending' NOT NULL,
	"providerTaskId" text,
	"failureReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"step" "ugc_work_step" DEFAULT 'product' NOT NULL,
	"stepStatus" "ugc_work_step_status" DEFAULT 'idle' NOT NULL,
	"productId" uuid,
	"talentId" uuid,
	"locale" text DEFAULT 'en' NOT NULL,
	"market" text DEFAULT 'US' NOT NULL,
	"template" "ugc_script_template" DEFAULT 'spokesperson' NOT NULL,
	"scriptId" uuid,
	"clipId" uuid,
	"taskRunId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ugc_clips" ALTER COLUMN "batchId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_work_frames" ADD CONSTRAINT "ugc_work_frames_workId_ugc_works_id_fk" FOREIGN KEY ("workId") REFERENCES "public"."ugc_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD CONSTRAINT "ugc_works_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD CONSTRAINT "ugc_works_productId_ugc_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."ugc_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD CONSTRAINT "ugc_works_talentId_ugc_talents_id_fk" FOREIGN KEY ("talentId") REFERENCES "public"."ugc_talents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD CONSTRAINT "ugc_works_scriptId_ugc_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."ugc_scripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD CONSTRAINT "ugc_works_clipId_ugc_clips_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."ugc_clips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ugc_work_frames_workId_position_idx" ON "ugc_work_frames" USING btree ("workId","position");--> statement-breakpoint
CREATE INDEX "ugc_works_userId_createdAt_idx" ON "ugc_works" USING btree ("userId","createdAt" DESC NULLS LAST);