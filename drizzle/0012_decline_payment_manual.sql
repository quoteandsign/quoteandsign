ALTER TABLE `acceptances` ADD `method` text DEFAULT 'online' NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `payment_url` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `payment_label` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `declined_at` integer;--> statement-breakpoint
ALTER TABLE `proposals` ADD `decline_reason` text;--> statement-breakpoint
ALTER TABLE `users` ADD `payment_url` text;