CREATE TABLE `ticket_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`from` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ticket_messages_ticket_idx` ON `ticket_messages` (`ticket_id`);--> statement-breakpoint
CREATE TABLE `tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'question' NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`subject` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`ip_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tickets_status_idx` ON `tickets` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `magic_tokens` ADD `marketing` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `magic_tokens` ADD `ip_hash` text;--> statement-breakpoint
ALTER TABLE `users` ADD `marketing_opt_in` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `marketing_opt_in_at` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `marketing_opt_in_ip_hash` text;