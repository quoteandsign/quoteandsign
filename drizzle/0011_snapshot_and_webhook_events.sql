CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`seen_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `acceptances` ADD `snapshot` text;