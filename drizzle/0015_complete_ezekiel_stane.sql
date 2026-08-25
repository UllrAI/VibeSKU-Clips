ALTER TABLE `media_edits` ADD `operation_id` text;--> statement-breakpoint
ALTER TABLE `media_edits` ADD `base_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `media_edits` ADD `actor` text DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE `media_edits` ADD `summary` text;--> statement-breakpoint
CREATE UNIQUE INDEX `media_edits_operation_id_unique` ON `media_edits` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `media_edits_source_revision_unique` ON `media_edits` (`source_id`,`revision`);