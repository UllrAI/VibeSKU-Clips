CREATE TYPE "public"."ugc_video_model" AS ENUM('h3', 'seedance-2.0', 'seedance-2.5');--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD COLUMN "videoModel" "ugc_video_model" DEFAULT 'h3' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "videoModel" "ugc_video_model" DEFAULT 'h3' NOT NULL;