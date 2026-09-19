CREATE TYPE "public"."ugc_scene_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "ugc_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"referenceImages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"views" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt" text,
	"status" "ugc_scene_status" DEFAULT 'generating' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD COLUMN "sceneId" uuid;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "sceneId" uuid;--> statement-breakpoint
ALTER TABLE "ugc_scenes" ADD CONSTRAINT "ugc_scenes_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ugc_scenes_userId_createdAt_idx" ON "ugc_scenes" USING btree ("userId","createdAt" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_sceneId_ugc_scenes_id_fk" FOREIGN KEY ("sceneId") REFERENCES "public"."ugc_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD CONSTRAINT "ugc_works_sceneId_ugc_scenes_id_fk" FOREIGN KEY ("sceneId") REFERENCES "public"."ugc_scenes"("id") ON DELETE set null ON UPDATE no action;