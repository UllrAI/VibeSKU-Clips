CREATE TYPE "public"."ugc_video_aspect_ratio" AS ENUM('9:16', '16:9');--> statement-breakpoint
CREATE TYPE "public"."ugc_video_resolution" AS ENUM('480p', '720p', '1080p', '2k');--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD COLUMN "aspectRatio" "ugc_video_aspect_ratio" DEFAULT '9:16' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD COLUMN "resolution" "ugc_video_resolution" DEFAULT '720p' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "aspectRatio" "ugc_video_aspect_ratio" DEFAULT '9:16' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "resolution" "ugc_video_resolution" DEFAULT '720p' NOT NULL;