ALTER TABLE "ugc_clips" ADD COLUMN "workId" uuid;--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "ugc_clips" AS clip
SET "workId" = work.id
FROM "ugc_works" AS work
WHERE work."clipId" = clip.id;--> statement-breakpoint
UPDATE "ugc_works"
SET step = 'done', "stepStatus" = 'review', "updatedAt" = now()
WHERE "clipId" IS NOT NULL
  AND (step <> 'done' OR "stepStatus" <> 'review')
  AND NOT EXISTS (
    SELECT 1
    FROM "task_runs" AS run
    WHERE run.id = "ugc_works"."taskRunId"
      AND run.status IN ('queued', 'running', 'waiting')
  );--> statement-breakpoint
ALTER TABLE "ugc_clips" ADD CONSTRAINT "ugc_clips_workId_ugc_works_id_fk" FOREIGN KEY ("workId") REFERENCES "public"."ugc_works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ugc_clips_workId_version_idx" ON "ugc_clips" USING btree ("workId","version");
