ALTER TYPE "public"."ugc_script_template" ADD VALUE 'tech_demo' BEFORE 'apparel';--> statement-breakpoint
ALTER TYPE "public"."ugc_script_template" ADD VALUE 'beauty_routine' BEFORE 'apparel';--> statement-breakpoint
ALTER TYPE "public"."ugc_script_template" ADD VALUE 'food_drink' BEFORE 'apparel';--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "creativeDirection" text;