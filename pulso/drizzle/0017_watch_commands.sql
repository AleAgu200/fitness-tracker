CREATE TABLE `watch_commands` (
	`command_id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`set_id` text,
	`received_at` integer NOT NULL
);
