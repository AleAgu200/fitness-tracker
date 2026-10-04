CREATE TABLE `health_connections` (
	`athlete_id` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`read_metrics` text DEFAULT '[]' NOT NULL,
	`write_workouts` integer DEFAULT false NOT NULL,
	`connected_at` integer,
	`disconnected_at` integer,
	`last_import_at` integer,
	`last_error` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`athlete_id`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `health_daily_steps` (
	`athlete_id` text NOT NULL,
	`provider` text NOT NULL,
	`local_date` text NOT NULL,
	`steps` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`athlete_id`, `provider`, `local_date`)
);
--> statement-breakpoint
CREATE TABLE `health_metric_sources` (
	`athlete_id` text NOT NULL,
	`metric` text NOT NULL,
	`provider` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`athlete_id`, `metric`)
);
--> statement-breakpoint
CREATE TABLE `health_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`source_app` text,
	`kind` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`tz_offset_min` integer,
	`value` real,
	`stage` text,
	`version` text,
	`deleted_at` integer,
	`imported_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `health_samples_provider_external` ON `health_samples` (`athlete_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE INDEX `health_samples_kind_time` ON `health_samples` (`athlete_id`,`kind`,`end_at`);--> statement-breakpoint
CREATE TABLE `health_sync_cursors` (
	`athlete_id` text NOT NULL,
	`provider` text NOT NULL,
	`metric` text NOT NULL,
	`cursor` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`athlete_id`, `provider`, `metric`)
);
--> statement-breakpoint
CREATE TABLE `health_workout_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`provider` text NOT NULL,
	`session_id` text NOT NULL,
	`client_record_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`external_id` text,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `health_workout_exports_status` ON `health_workout_exports` (`athlete_id`,`status`);--> statement-breakpoint
CREATE TABLE `sleep_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`wake_date` text NOT NULL,
	`minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sleep_entries_athlete_date` ON `sleep_entries` (`athlete_id`,`wake_date`);--> statement-breakpoint
ALTER TABLE `body_measurements` ADD `source` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `body_measurements` ADD `external_id` text;