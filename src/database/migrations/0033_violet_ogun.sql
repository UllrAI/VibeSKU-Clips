CREATE TYPE "public"."ugc_talent_status" AS ENUM('generating', 'ready', 'failed');--> statement-breakpoint
ALTER TABLE "ugc_talents" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_talents" ADD COLUMN "referenceImages" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_talents" ADD COLUMN "status" "ugc_talent_status" DEFAULT 'ready' NOT NULL;--> statement-breakpoint
UPDATE "ugc_talents" SET "status" = 'failed' WHERE "imageUrl" IS NULL;--> statement-breakpoint
ALTER TABLE "ugc_talents" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "ugc_talents" DROP COLUMN "licenceNote";--> statement-breakpoint
ALTER TABLE "ugc_talents" DROP COLUMN "voicePreset";--> statement-breakpoint
DROP TYPE "public"."ugc_talent_source";
