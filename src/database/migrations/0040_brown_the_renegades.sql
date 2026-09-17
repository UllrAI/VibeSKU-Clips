CREATE TYPE "public"."ugc_audio_mode" AS ENUM('native', 'tts');--> statement-breakpoint
CREATE TYPE "public"."ugc_composition_status" AS ENUM('pending', 'running', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ugc_segment_status" AS ENUM('pending', 'generating', 'transcribing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "ugc_compositions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workId" uuid NOT NULL,
	"scriptId" uuid NOT NULL,
	"version" integer NOT NULL,
	"takeIds" jsonb NOT NULL,
	"status" "ugc_composition_status" DEFAULT 'pending' NOT NULL,
	"taskRunId" uuid,
	"clipId" uuid,
	"failureReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_work_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workId" uuid NOT NULL,
	"scriptId" uuid NOT NULL,
	"position" integer NOT NULL,
	"startMs" integer NOT NULL,
	"endMs" integer NOT NULL,
	"activeTakeId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ugc_work_takes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segmentId" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "ugc_segment_status" DEFAULT 'pending' NOT NULL,
	"videoTaskId" text,
	"taskRunId" uuid,
	"asrTaskId" text,
	"videoUrl" text,
	"audioUrl" text,
	"words" jsonb,
	"transcript" text,
	"failureReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD COLUMN "durationSeconds" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD COLUMN "audioMode" "ugc_audio_mode" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_usage_events" ADD COLUMN "sourceKey" text;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "durationSeconds" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "audioMode" "ugc_audio_mode" DEFAULT 'native' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_compositions" ADD CONSTRAINT "ugc_compositions_workId_ugc_works_id_fk" FOREIGN KEY ("workId") REFERENCES "public"."ugc_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_compositions" ADD CONSTRAINT "ugc_compositions_scriptId_ugc_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."ugc_scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_compositions" ADD CONSTRAINT "ugc_compositions_clipId_ugc_clips_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."ugc_clips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_work_segments" ADD CONSTRAINT "ugc_work_segments_workId_ugc_works_id_fk" FOREIGN KEY ("workId") REFERENCES "public"."ugc_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_work_segments" ADD CONSTRAINT "ugc_work_segments_scriptId_ugc_scripts_id_fk" FOREIGN KEY ("scriptId") REFERENCES "public"."ugc_scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_work_takes" ADD CONSTRAINT "ugc_work_takes_segmentId_ugc_work_segments_id_fk" FOREIGN KEY ("segmentId") REFERENCES "public"."ugc_work_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_compositions_work_version_idx" ON "ugc_compositions" USING btree ("workId","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_segments_work_script_position_idx" ON "ugc_work_segments" USING btree ("workId","scriptId","position");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_takes_segment_version_idx" ON "ugc_work_takes" USING btree ("segmentId","version");--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_usage_events_sourceKey_idx" ON "ugc_usage_events" USING btree ("sourceKey");