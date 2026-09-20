CREATE TABLE `partner_conversions` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`user_id` text NOT NULL,
	`order_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`commission` integer NOT NULL,
	`created_at` integer NOT NULL,
	`reversed_at` integer,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partner_conversions_order_uq` ON `partner_conversions` (`order_id`);--> statement-breakpoint
CREATE INDEX `partner_conversions_partner_idx` ON `partner_conversions` (`partner_id`);--> statement-breakpoint
CREATE TABLE `partner_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`partner_id` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`note` text,
	`paid_at` integer NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `partner_payouts_partner_idx` ON `partner_payouts` (`partner_id`);--> statement-breakpoint
CREATE TABLE `partners` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`contact_email` text,
	`share_pct` integer DEFAULT 25 NOT NULL,
	`bonus_days` integer DEFAULT 30 NOT NULL,
	`view_token` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partners_code_uq` ON `partners` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `partners_token_uq` ON `partners` (`view_token`);--> statement-breakpoint
ALTER TABLE `magic_tokens` ADD `partner` text;--> statement-breakpoint
ALTER TABLE `users` ADD `partner_id` text;