ALTER TABLE `acceptances` ADD `countersigned_at` integer;--> statement-breakpoint
ALTER TABLE `acceptances` ADD `countersigner_name` text;--> statement-breakpoint
ALTER TABLE `proposals` ADD `countersign` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `hide_made_with` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `billing_interval` text;--> statement-breakpoint
ALTER TABLE `users` ADD `trial_warned` integer DEFAULT 0 NOT NULL;