CREATE TABLE `session_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`session_id` text NOT NULL,
	`type` text NOT NULL,
	`metric_json` text NOT NULL,
	`earned_at` integer NOT NULL,
	`shared_with_team_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_card_session` ON `session_cards` (`session_id`);--> statement-breakpoint
CREATE TABLE `weekly_summaries` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`week_start` text NOT NULL,
	`summary_json` text NOT NULL,
	`generated_at` integer NOT NULL,
	`viewed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_summary_athlete_week` ON `weekly_summaries` (`athlete_id`,`week_start`);--> statement-breakpoint
ALTER TABLE `programs` ADD `origin` text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE `workout_templates` ADD `kind` text DEFAULT 'plan' NOT NULL;