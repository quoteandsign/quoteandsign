CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_proposal_idx` ON `messages` (`proposal_id`);--> statement-breakpoint
ALTER TABLE `proposals` ADD `sender_name` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `accent_color` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `cc_emails` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `remind` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `reminder_sent_at` integer;