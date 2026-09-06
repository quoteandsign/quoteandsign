CREATE TABLE `user_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`style` text,
	`accent_color` text,
	`content` text NOT NULL,
	`items` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_templates_user_idx` ON `user_templates` (`user_id`);