ALTER TABLE `users` ADD `deleted_email_hash` text;--> statement-breakpoint
CREATE INDEX `users_deleted_email_idx` ON `users` (`deleted_email_hash`);