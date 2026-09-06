-- Uploaded images now live in the database. Rebuild the table; any earlier local rows had no bytes
-- stored here, so the logo pointer on the account is cleared with them.
DROP TABLE IF EXISTS `files`;--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_key_uq` ON `files` (`key`);--> statement-breakpoint
CREATE INDEX `files_user_idx` ON `files` (`user_id`);--> statement-breakpoint
UPDATE `users` SET `brand_logo_key` = NULL;
