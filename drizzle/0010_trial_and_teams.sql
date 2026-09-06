CREATE TABLE `team_members` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`email` text NOT NULL,
	`member_id` text,
	`invited_at` integer NOT NULL,
	`joined_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_members_owner_email_uq` ON `team_members` (`owner_id`,`email`);--> statement-breakpoint
CREATE INDEX `team_members_member_idx` ON `team_members` (`member_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `trial_ends_at` integer;
--> statement-breakpoint
-- Everyone already on Free gets the same 14-day Pro trial new accounts get.
UPDATE `users` SET `trial_ends_at` = (strftime('%s', 'now') + 14 * 86400) * 1000 WHERE `plan` = 'free' AND `deleted_at` IS NULL AND `trial_ends_at` IS NULL;
