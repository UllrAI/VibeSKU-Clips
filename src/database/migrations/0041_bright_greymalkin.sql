CREATE TYPE "public"."ugc_reference_source" AS ENUM('upload', 'url');--> statement-breakpoint
CREATE TYPE "public"."ugc_reference_status" AS ENUM('pending', 'ingesting', 'analyzing', 'review', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "ugc_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"source" "ugc_reference_source" NOT NULL,
	"sourceUrl" text,
	"rightsAcknowledgedAt" timestamp with time zone NOT NULL,
	"videoUrl" text,
	"durationMs" integer,
	"aspectRatio" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"frames" jsonb,
	"asrTaskId" text,
	"transcript" text,
	"words" jsonb,
	"blueprint" jsonb,
	"status" "ugc_reference_status" DEFAULT 'pending' NOT NULL,
	"taskRunId" uuid,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "referenceId" uuid;--> statement-breakpoint
ALTER TABLE "ugc_references" ADD CONSTRAINT "ugc_references_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ugc_references_userId_createdAt_idx" ON "ugc_references" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ugc_works" ADD CONSTRAINT "ugc_works_referenceId_ugc_references_id_fk" FOREIGN KEY ("referenceId") REFERENCES "public"."ugc_references"("id") ON DELETE set null ON UPDATE no action;