ALTER TABLE "ugc_products" ADD COLUMN "info" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ugc_works" ADD COLUMN "autoStartScript" boolean DEFAULT false NOT NULL;--> statement-breakpoint

UPDATE "ugc_products"
SET "info" = left(concat_ws(
  E'\n',
  CASE WHEN nullif("variant", '') IS NOT NULL THEN 'Variant: ' || "variant" END,
  CASE WHEN nullif("market", '') IS NOT NULL THEN 'Previous market: ' || "market" END,
  nullif("facts"->>'summary', ''),
  nullif("facts"->>'appearance', ''),
  CASE WHEN nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("facts"->'sellingPoints', '[]'::jsonb))), '; '), '') IS NOT NULL
    THEN 'Selling points: ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("facts"->'sellingPoints', '[]'::jsonb))), '; ') END,
  CASE WHEN nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("facts"->'specs', '[]'::jsonb))), '; '), '') IS NOT NULL
    THEN 'Specifications: ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("facts"->'specs', '[]'::jsonb))), '; ') END,
  CASE WHEN nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("facts"->'scenarios', '[]'::jsonb))), '; '), '') IS NOT NULL
    THEN 'Use cases: ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("facts"->'scenarios', '[]'::jsonb))), '; ') END,
  CASE WHEN nullif("brief"->>'audience', '') IS NOT NULL THEN 'Previous audience: ' || ("brief"->>'audience') END,
  CASE WHEN nullif("brief"->>'tone', '') IS NOT NULL THEN 'Previous tone: ' || ("brief"->>'tone') END,
  CASE WHEN nullif("brief"->>'scenes', '') IS NOT NULL THEN 'Previous scene notes: ' || ("brief"->>'scenes') END,
  CASE WHEN nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("brief"->'bannedPhrases', '[]'::jsonb))), '; '), '') IS NOT NULL
    THEN 'Previous banned phrases: ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce("brief"->'bannedPhrases', '[]'::jsonb))), '; ') END,
  nullif("brief"->>'providedScript', '')
), 40000)
WHERE "info" = '';--> statement-breakpoint

UPDATE "ugc_products"
SET "facts" = jsonb_strip_nulls(jsonb_build_object(
  'overview', left(concat_ws(E'\n', nullif("facts"->>'summary', ''), nullif("facts"->>'appearance', '')), 2000),
  'highlights', (SELECT coalesce(jsonb_agg(value), '[]'::jsonb)
    FROM (SELECT value FROM jsonb_array_elements(
      coalesce("facts"->'sellingPoints', '[]'::jsonb) ||
      coalesce("facts"->'specs', '[]'::jsonb) ||
      coalesce("facts"->'scenarios', '[]'::jsonb)
    ) LIMIT 10) AS limited),
  'sources', coalesce("facts"->'sources', '[]'::jsonb),
  'warnings', coalesce("facts"->'missing', '[]'::jsonb),
  'keyImages', "facts"->'keyImages'
))
WHERE "facts" IS NOT NULL;--> statement-breakpoint

UPDATE "ugc_products"
SET "status" = 'ready'
WHERE "status" IN ('review', 'needs_input')
  AND "facts" IS NOT NULL
  AND nullif("facts"->>'overview', '') IS NOT NULL
  AND jsonb_array_length("images") > 0;
