PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_pricing_items` (
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
	`tax_rate_bps` integer,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_pricing_items`("id", "proposal_id", "position", "name", "description", "unit_amount", "quantity", "min_quantity", "max_quantity", "optional", "selected_by_default", "tax_rate_bps") SELECT "id", "proposal_id", "position", "name", "description", "unit_amount", "quantity", "min_quantity", "max_quantity", "optional", "selected_by_default", NULLIF("tax_rate_bps", 0) FROM `pricing_items`;--> statement-breakpoint
DROP TABLE `pricing_items`;--> statement-breakpoint
ALTER TABLE `__new_pricing_items` RENAME TO `pricing_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `pricing_items_proposal_idx` ON `pricing_items` (`proposal_id`);--> statement-breakpoint
ALTER TABLE `proposals` ADD `tax_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `proposals` ADD `tax_label` text;