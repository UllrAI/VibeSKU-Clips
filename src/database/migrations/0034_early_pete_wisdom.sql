ALTER TABLE "ugc_exports" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "ugc_exports" CASCADE;--> statement-breakpoint
DROP INDEX "ugc_clips_userId_reviewStatus_idx";--> statement-breakpoint
DROP INDEX "ugc_clips_userId_similarityKey_idx";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "similarityKey";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "reviewStatus";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "reviewNote";--> statement-breakpoint
DROP TYPE "public"."ugc_review_status";