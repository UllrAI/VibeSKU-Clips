ALTER TYPE "public"."ugc_script_template" ADD VALUE 'apparel';--> statement-breakpoint
ALTER TYPE "public"."ugc_script_template" ADD VALUE 'accessory';--> statement-breakpoint
ALTER TYPE "public"."ugc_script_template" ADD VALUE 'unboxing';--> statement-breakpoint
ALTER TABLE "ugc_talents" ADD COLUMN "fullBodyUrl" text;