ALTER TABLE "ugc_scenes" ADD COLUMN "sheetUrl" text;--> statement-breakpoint
ALTER TABLE "ugc_talents" ADD COLUMN "sheetUrl" text;--> statement-breakpoint
-- Views were separate photographs; a sheet is one image with panels in it. The
-- first view is the closest thing an existing row has to one, so it is kept as
-- the reference rather than discarded: it still shows the right person or the
-- right place, just from a single angle.
UPDATE "ugc_scenes" SET "sheetUrl" = "views" -> 0 ->> 'imageUrl' WHERE jsonb_array_length("views") > 0;--> statement-breakpoint
UPDATE "ugc_talents" SET "sheetUrl" = "views" -> 0 ->> 'imageUrl' WHERE jsonb_array_length("views") > 0;
