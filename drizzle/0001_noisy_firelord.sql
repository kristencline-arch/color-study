CREATE TABLE `catalog_photos` (
	`release_id` text NOT NULL,
	`id` text NOT NULL,
	`category` text NOT NULL,
	`region` text NOT NULL,
	`provider` text NOT NULL,
	`year_start` integer,
	`year_end` integer,
	`search_text` text NOT NULL,
	`sort_order` integer NOT NULL,
	`data_json` text NOT NULL,
	PRIMARY KEY(`release_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `catalog_photos_browse` ON `catalog_photos` (`release_id`,`category`,`sort_order`);--> statement-breakpoint
CREATE TABLE `catalog_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL
);
