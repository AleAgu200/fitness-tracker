CREATE TABLE `device_sync_state` (
	`athlete_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`backfilled_at` integer,
	`last_sync_at` integer,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_applying` (
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	PRIMARY KEY(`table_name`, `record_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_capture_guard` (
	`id` integer PRIMARY KEY NOT NULL,
	`paused` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_changes` (
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`op` text NOT NULL,
	`changed_at` integer NOT NULL,
	PRIMARY KEY(`table_name`, `record_id`)
);
