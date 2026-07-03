CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`platform` text NOT NULL,
	`os_version` text,
	`app_version` text,
	`push_token` text,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_fingerprint_user` ON `devices` (`fingerprint`,`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'athlete' NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `athlete_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`coach_id` text,
	`full_name` text NOT NULL,
	`initials` text NOT NULL,
	`date_of_birth` text,
	`sex` text,
	`height_cm` real,
	`goal_weight_kg` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `body_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`measured_at` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`body_fat_pct` real,
	`muscle_mass_pct` real,
	`notes` text,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `coach_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`initials` text NOT NULL,
	`bio` text,
	`specialization` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`local_uri` text NOT NULL,
	`angle` text,
	`phase_id` text,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`muscle_group` text,
	`equipment` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `logged_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`slot_id` text,
	`exercise_order` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `workout_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`slot_id`) REFERENCES `template_exercise_slots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `logged_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`logged_exercise_id` text NOT NULL,
	`set_number` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	`rpe` integer,
	`is_pr` integer DEFAULT false NOT NULL,
	`completed_at` integer NOT NULL,
	FOREIGN KEY (`logged_exercise_id`) REFERENCES `logged_exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	`e1rm` real,
	`achieved_at` integer NOT NULL,
	`session_id` text,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pr_athlete_exercise` ON `personal_records` (`athlete_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `program_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`phase_order` integer NOT NULL,
	`week_number` integer DEFAULT 1 NOT NULL,
	`total_weeks` integer NOT NULL,
	`start_date` text,
	`end_date` text,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `programs` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`coach_id` text,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `template_exercise_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`slot_order` integer NOT NULL,
	`target_sets` integer NOT NULL,
	`target_reps` integer NOT NULL,
	`target_rpe_min` integer,
	`target_rpe_max` integer,
	`target_weight_kg` real,
	`rest_seconds` integer DEFAULT 90 NOT NULL,
	`coach_notes` text,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `workout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`template_id` text,
	`scheduled_for` integer,
	`started_at` integer,
	`finished_at` integer,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`total_tonnage_kg` real DEFAULT 0 NOT NULL,
	`coach_notes` text,
	`athlete_notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text,
	`coach_id` text,
	`name` text NOT NULL,
	`session_label` text,
	`type` text,
	`template_order` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `daily_nutrition_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`date` text NOT NULL,
	`meal_plan_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_nutrition_athlete_date` ON `daily_nutrition_logs` (`athlete_id`,`date`);--> statement-breakpoint
CREATE TABLE `meal_log_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`daily_log_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`substitute_note` text,
	`logged_at` integer,
	FOREIGN KEY (`daily_log_id`) REFERENCES `daily_nutrition_logs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_entry_log_slot` ON `meal_log_entries` (`daily_log_id`,`slot_id`);--> statement-breakpoint
CREATE TABLE `meal_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`coach_id` text,
	`name` text NOT NULL,
	`target_kcal` integer NOT NULL,
	`target_protein_g` integer NOT NULL,
	`target_carbs_g` integer NOT NULL,
	`target_fat_g` integer NOT NULL,
	`phase_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`coach_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`phase_id`) REFERENCES `program_phases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `meal_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`meal_plan_id` text NOT NULL,
	`name` text NOT NULL,
	`scheduled_time` text,
	`slot_order` integer NOT NULL,
	`default_name` text NOT NULL,
	`target_kcal` integer,
	`target_protein_g` integer,
	`target_carbs_g` integer,
	`target_fat_g` integer,
	FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `water_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`date` text NOT NULL,
	`glasses` integer DEFAULT 0 NOT NULL,
	`ml_total` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `water_athlete_date` ON `water_logs` (`athlete_id`,`date`);--> statement-breakpoint
CREATE TABLE `achievement_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon` text,
	`condition_type` text NOT NULL,
	`condition_value` real
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_definitions_key_unique` ON `achievement_definitions` (`key`);--> statement-breakpoint
CREATE TABLE `athlete_achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`earned_at` integer NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievement_id`) REFERENCES `achievement_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_athlete_def` ON `athlete_achievements` (`athlete_id`,`achievement_id`);--> statement-breakpoint
CREATE TABLE `coach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`receiver_id` text NOT NULL,
	`content` text NOT NULL,
	`sent_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`sender_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `daily_check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`date` text NOT NULL,
	`workout_completed` integer DEFAULT false NOT NULL,
	`nutrition_completed` integer DEFAULT false NOT NULL,
	`hydration_completed` integer DEFAULT false NOT NULL,
	`streak_day` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkin_athlete_date` ON `daily_check_ins` (`athlete_id`,`date`);--> statement-breakpoint
CREATE TABLE `ai_context_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`snapshot_type` text NOT NULL,
	`payload` text NOT NULL,
	`token_estimate` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`given_at` integer NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `ai_recommendations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`context_snapshot` text,
	`priority` integer DEFAULT 1 NOT NULL,
	`model` text,
	`generated_at` integer NOT NULL,
	`read_at` integer,
	`dismissed_at` integer,
	`applied_at` integer,
	FOREIGN KEY (`athlete_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
