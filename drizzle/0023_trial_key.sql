ALTER TABLE `users` ADD `trial_key` text;--> statement-breakpoint
CREATE INDEX `users_trial_key_idx` ON `users` (`trial_key`);