ALTER TABLE `proposals` ADD `send_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `last_sent_at` integer;