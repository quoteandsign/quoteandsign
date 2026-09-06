CREATE TABLE `acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`signer_name` text NOT NULL,
	`signer_email` text,
	`signed_text` text NOT NULL,
	`selected_item_ids` text NOT NULL,
	`total_amount` integer NOT NULL,
	`currency` text NOT NULL,
	`content_hash` text NOT NULL,
	`ip` text NOT NULL,
	`user_agent` text,
	`accepted_at` integer NOT NULL,
	`consent_text` text NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acceptances_proposal_uq` ON `acceptances` (`proposal_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`proposal_id` text,
	`event` text NOT NULL,
	`meta` text,
	`ip_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_log` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_key_uq` ON `files` (`key`);--> statement-breakpoint
CREATE INDEX `files_user_idx` ON `files` (`user_id`);--> statement-breakpoint
CREATE TABLE `magic_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `magic_tokens_email_idx` ON `magic_tokens` (`email`);--> statement-breakpoint
CREATE TABLE `pricing_items` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`position` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`unit_amount` integer NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`min_quantity` integer,
	`max_quantity` integer,
	`optional` integer DEFAULT false NOT NULL,
	`selected_by_default` integer DEFAULT true NOT NULL,
	`tax_rate_bps` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pricing_items_proposal_idx` ON `pricing_items` (`proposal_id`);--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`public_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`client_name` text,
	`client_email` text,
	`currency` text DEFAULT 'USD' NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`password_hash` text,
	`expires_at` integer,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `proposals_public_id_uq` ON `proposals` (`public_id`);--> statement-breakpoint
CREATE INDEX `proposals_user_idx` ON `proposals` (`user_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`window_start` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`brand_name` text,
	`brand_logo_key` text,
	`brand_color` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`polar_customer_id` text,
	`created_at` integer NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_uq` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `views` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`viewed_at` integer NOT NULL,
	`ip_hash` text,
	`user_agent` text,
	`country` text,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `views_proposal_idx` ON `views` (`proposal_id`);