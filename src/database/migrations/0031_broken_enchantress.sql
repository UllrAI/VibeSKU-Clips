DELETE FROM "ugc_exports";--> statement-breakpoint
DELETE FROM "ugc_usage_events" WHERE "batchId" IS NOT NULL;--> statement-breakpoint
DELETE FROM "ugc_clips" WHERE "batchId" IS NOT NULL;--> statement-breakpoint
DELETE FROM "task_runs" WHERE "kind" IN ('ugc.batch.run', 'ugc.clip.render');--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP CONSTRAINT "ugc_clips_batchId_ugc_batches_id_fk";
--> statement-breakpoint
DROP INDEX "ugc_clips_batchId_idx";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "batchId";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "accountTag";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "taskRunId";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "attempts";--> statement-breakpoint
ALTER TABLE "ugc_clips" DROP COLUMN "regeneratedFrom";--> statement-breakpoint
ALTER TABLE "ugc_exports" DROP COLUMN "groupBy";--> statement-breakpoint
ALTER TABLE "ugc_usage_events" DROP COLUMN "batchId";--> statement-breakpoint
DROP TABLE "ugc_batches";--> statement-breakpoint
DROP TYPE "public"."ugc_batch_status";
