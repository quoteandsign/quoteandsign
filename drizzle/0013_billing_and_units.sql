ALTER TABLE `acceptances` ADD `recurring` text;--> statement-breakpoint
ALTER TABLE `pricing_items` ADD `billing` text DEFAULT 'once' NOT NULL;--> statement-breakpoint
ALTER TABLE `pricing_items` ADD `unit` text;