ALTER TABLE `magic_tokens` ADD `source` text;--> statement-breakpoint
ALTER TABLE `magic_tokens` ADD `referral` text;--> statement-breakpoint
ALTER TABLE `users` ADD `source` text;--> statement-breakpoint
ALTER TABLE `users` ADD `referral_code` text;--> statement-breakpoint
ALTER TABLE `users` ADD `referred_by` text;--> statement-breakpoint
ALTER TABLE `users` ADD `referral_rewarded_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `users_referral_code_uq` ON `users` (`referral_code`);--> statement-breakpoint
CREATE INDEX `users_referred_by_idx` ON `users` (`referred_by`);