CREATE TABLE `generation_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`shot_id` integer NOT NULL,
	`contract` text NOT NULL,
	`report` text NOT NULL,
	`disposition` text NOT NULL,
	`evaluator_model` text NOT NULL,
	`verdict` text NOT NULL,
	`human_decision` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `assets` ADD `selected` integer DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE `assets` SET `selected` = false
WHERE `rowid` NOT IN (
	SELECT MAX(`rowid`) FROM `assets` GROUP BY `project_id`, `shot_id`
);
