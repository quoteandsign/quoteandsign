CREATE TABLE `section_time` (
	`proposal_id` text NOT NULL,
	`section_id` text NOT NULL,
	`title` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`proposal_id`, `section_id`),
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
