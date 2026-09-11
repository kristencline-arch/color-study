CREATE TABLE `community_limits` (
	`bucket` text PRIMARY KEY NOT NULL,
	`used` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `community_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`title` text NOT NULL,
	`location` text NOT NULL,
	`author` text NOT NULL,
	`description` text NOT NULL,
	`image_key` text NOT NULL,
	`thumbnail_key` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`removal_hash` text NOT NULL,
	`license` text DEFAULT 'CC BY 4.0' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `community_photos_created` ON `community_photos` (`created_at`,`id`);