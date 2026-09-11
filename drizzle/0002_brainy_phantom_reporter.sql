CREATE TABLE `photo_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`photo_id` text NOT NULL,
	`photo_type` text NOT NULL,
	`reason` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `photo_reports_status` ON `photo_reports` (`status`,`created_at`,`id`);