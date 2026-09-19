ALTER TABLE "ugc_talents" ALTER COLUMN "status" SET DEFAULT 'generating';--> statement-breakpoint
ALTER TABLE "ugc_talents" ADD COLUMN "views" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Carry the two existing reference images into the view list, in the order the
-- angles are drawn. A talent whose portrait never landed has nothing to carry.
UPDATE "ugc_talents" SET "views" =
	CASE WHEN "imageUrl" IS NULL THEN '[]'::jsonb ELSE
		jsonb_build_array(jsonb_build_object('angle', 'portrait', 'imageUrl', "imageUrl"))
	END ||
	CASE WHEN "fullBodyUrl" IS NULL THEN '[]'::jsonb ELSE
		jsonb_build_array(jsonb_build_object('angle', 'full_body', 'imageUrl', "fullBodyUrl"))
	END
WHERE "views" = '[]'::jsonb;
