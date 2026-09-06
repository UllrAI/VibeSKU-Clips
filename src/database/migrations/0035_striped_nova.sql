CREATE TYPE "public"."ugc_video_mode" AS ENUM('one_take', 'storyboard');--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "videoMode" "ugc_video_mode";--> statement-breakpoint
UPDATE "ugc_works" SET "videoMode" = 'storyboard';--> statement-breakpoint
ALTER TABLE "ugc_works" ALTER COLUMN "videoMode" SET DEFAULT 'one_take';--> statement-breakpoint
ALTER TABLE "ugc_works" ALTER COLUMN "videoMode" SET NOT NULL;
