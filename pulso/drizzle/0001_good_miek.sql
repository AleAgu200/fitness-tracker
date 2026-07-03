DROP TABLE `sessions`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`fingerprint` text NOT NULL,
	`platform` text NOT NULL,
	`os_version` text,
	`app_version` text,
	`push_token` text,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_devices`("id", "user_id", "fingerprint", "platform", "os_version", "app_version", "push_token", "last_seen_at", "created_at") SELECT "id", "user_id", "fingerprint", "platform", "os_version", "app_version", "push_token", "last_seen_at", "created_at" FROM `devices`;--> statement-breakpoint
DROP TABLE `devices`;--> statement-breakpoint
ALTER TABLE `__new_devices` RENAME TO `devices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `devices_fingerprint_user` ON `devices` (`fingerprint`,`user_id`);--> statement-breakpoint
CREATE TABLE `__new_athlete_profiles` (
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
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_athlete_profiles`("user_id", "coach_id", "full_name", "initials", "date_of_birth", "sex", "height_cm", "goal_weight_kg", "notes", "created_at", "updated_at") SELECT "user_id", "coach_id", "full_name", "initials", "date_of_birth", "sex", "height_cm", "goal_weight_kg", "notes", "created_at", "updated_at" FROM `athlete_profiles`;--> statement-breakpoint
DROP TABLE `athlete_profiles`;--> statement-breakpoint
ALTER TABLE `__new_athlete_profiles` RENAME TO `athlete_profiles`;--> statement-breakpoint
CREATE TABLE `__new_body_measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`measured_at` integer NOT NULL,
	`weight_kg` real NOT NULL,
	`body_fat_pct` real,
	`muscle_mass_pct` real,
	`notes` text
);
--> statement-breakpoint
INSERT INTO `__new_body_measurements`("id", "athlete_id", "measured_at", "weight_kg", "body_fat_pct", "muscle_mass_pct", "notes") SELECT "id", "athlete_id", "measured_at", "weight_kg", "body_fat_pct", "muscle_mass_pct", "notes" FROM `body_measurements`;--> statement-breakpoint
DROP TABLE `body_measurements`;--> statement-breakpoint
ALTER TABLE `__new_body_measurements` RENAME TO `body_measurements`;--> statement-breakpoint
CREATE TABLE `__new_coach_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`initials` text NOT NULL,
	`bio` text,
	`specialization` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_coach_profiles`("user_id", "full_name", "initials", "bio", "specialization", "created_at", "updated_at") SELECT "user_id", "full_name", "initials", "bio", "specialization", "created_at", "updated_at" FROM `coach_profiles`;--> statement-breakpoint
DROP TABLE `coach_profiles`;--> statement-breakpoint
ALTER TABLE `__new_coach_profiles` RENAME TO `coach_profiles`;--> statement-breakpoint
CREATE TABLE `__new_progress_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`taken_at` integer NOT NULL,
	`local_uri` text NOT NULL,
	`angle` text,
	`phase_id` text
);
--> statement-breakpoint
INSERT INTO `__new_progress_photos`("id", "athlete_id", "taken_at", "local_uri", "angle", "phase_id") SELECT "id", "athlete_id", "taken_at", "local_uri", "angle", "phase_id" FROM `progress_photos`;--> statement-breakpoint
DROP TABLE `progress_photos`;--> statement-breakpoint
ALTER TABLE `__new_progress_photos` RENAME TO `progress_photos`;--> statement-breakpoint
CREATE TABLE `__new_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`muscle_group` text,
	`equipment` text,
	`is_custom` integer DEFAULT false NOT NULL,
	`created_by_user_id` text
);
--> statement-breakpoint
INSERT INTO `__new_exercises`("id", "name", "muscle_group", "equipment", "is_custom", "created_by_user_id") SELECT "id", "name", "muscle_group", "equipment", "is_custom", "created_by_user_id" FROM `exercises`;--> statement-breakpoint
DROP TABLE `exercises`;--> statement-breakpoint
ALTER TABLE `__new_exercises` RENAME TO `exercises`;--> statement-breakpoint
CREATE TABLE `__new_personal_records` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`weight_kg` real NOT NULL,
	`reps` integer NOT NULL,
	`e1rm` real,
	`achieved_at` integer NOT NULL,
	`session_id` text,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_personal_records`("id", "athlete_id", "exercise_id", "weight_kg", "reps", "e1rm", "achieved_at", "session_id") SELECT "id", "athlete_id", "exercise_id", "weight_kg", "reps", "e1rm", "achieved_at", "session_id" FROM `personal_records`;--> statement-breakpoint
DROP TABLE `personal_records`;--> statement-breakpoint
ALTER TABLE `__new_personal_records` RENAME TO `personal_records`;--> statement-breakpoint
CREATE UNIQUE INDEX `pr_athlete_exercise` ON `personal_records` (`athlete_id`,`exercise_id`);--> statement-breakpoint
CREATE TABLE `__new_programs` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`coach_id` text,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_programs`("id", "athlete_id", "coach_id", "name", "start_date", "end_date", "active", "created_at") SELECT "id", "athlete_id", "coach_id", "name", "start_date", "end_date", "active", "created_at" FROM `programs`;--> statement-breakpoint
DROP TABLE `programs`;--> statement-breakpoint
ALTER TABLE `__new_programs` RENAME TO `programs`;--> statement-breakpoint
CREATE TABLE `__new_workout_sessions` (
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
	FOREIGN KEY (`template_id`) REFERENCES `workout_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_workout_sessions`("id", "athlete_id", "template_id", "scheduled_for", "started_at", "finished_at", "status", "total_tonnage_kg", "coach_notes", "athlete_notes", "created_at") SELECT "id", "athlete_id", "template_id", "scheduled_for", "started_at", "finished_at", "status", "total_tonnage_kg", "coach_notes", "athlete_notes", "created_at" FROM `workout_sessions`;--> statement-breakpoint
DROP TABLE `workout_sessions`;--> statement-breakpoint
ALTER TABLE `__new_workout_sessions` RENAME TO `workout_sessions`;--> statement-breakpoint
CREATE TABLE `__new_workout_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`program_id` text,
	`coach_id` text,
	`name` text NOT NULL,
	`session_label` text,
	`type` text,
	`template_order` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_workout_templates`("id", "program_id", "coach_id", "name", "session_label", "type", "template_order", "created_at") SELECT "id", "program_id", "coach_id", "name", "session_label", "type", "template_order", "created_at" FROM `workout_templates`;--> statement-breakpoint
DROP TABLE `workout_templates`;--> statement-breakpoint
ALTER TABLE `__new_workout_templates` RENAME TO `workout_templates`;--> statement-breakpoint
CREATE TABLE `__new_daily_nutrition_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`date` text NOT NULL,
	`meal_plan_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meal_plan_id`) REFERENCES `meal_plans`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_daily_nutrition_logs`("id", "athlete_id", "date", "meal_plan_id", "created_at") SELECT "id", "athlete_id", "date", "meal_plan_id", "created_at" FROM `daily_nutrition_logs`;--> statement-breakpoint
DROP TABLE `daily_nutrition_logs`;--> statement-breakpoint
ALTER TABLE `__new_daily_nutrition_logs` RENAME TO `daily_nutrition_logs`;--> statement-breakpoint
CREATE UNIQUE INDEX `daily_nutrition_athlete_date` ON `daily_nutrition_logs` (`athlete_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_meal_plans` (
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
	FOREIGN KEY (`phase_id`) REFERENCES `program_phases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_meal_plans`("id", "athlete_id", "coach_id", "name", "target_kcal", "target_protein_g", "target_carbs_g", "target_fat_g", "phase_id", "active", "created_at") SELECT "id", "athlete_id", "coach_id", "name", "target_kcal", "target_protein_g", "target_carbs_g", "target_fat_g", "phase_id", "active", "created_at" FROM `meal_plans`;--> statement-breakpoint
DROP TABLE `meal_plans`;--> statement-breakpoint
ALTER TABLE `__new_meal_plans` RENAME TO `meal_plans`;--> statement-breakpoint
CREATE TABLE `__new_water_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`date` text NOT NULL,
	`glasses` integer DEFAULT 0 NOT NULL,
	`ml_total` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_water_logs`("id", "athlete_id", "date", "glasses", "ml_total") SELECT "id", "athlete_id", "date", "glasses", "ml_total" FROM `water_logs`;--> statement-breakpoint
DROP TABLE `water_logs`;--> statement-breakpoint
ALTER TABLE `__new_water_logs` RENAME TO `water_logs`;--> statement-breakpoint
CREATE UNIQUE INDEX `water_athlete_date` ON `water_logs` (`athlete_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_athlete_achievements` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`earned_at` integer NOT NULL,
	FOREIGN KEY (`achievement_id`) REFERENCES `achievement_definitions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_athlete_achievements`("id", "athlete_id", "achievement_id", "earned_at") SELECT "id", "athlete_id", "achievement_id", "earned_at" FROM `athlete_achievements`;--> statement-breakpoint
DROP TABLE `athlete_achievements`;--> statement-breakpoint
ALTER TABLE `__new_athlete_achievements` RENAME TO `athlete_achievements`;--> statement-breakpoint
CREATE UNIQUE INDEX `achievement_athlete_def` ON `athlete_achievements` (`athlete_id`,`achievement_id`);--> statement-breakpoint
CREATE TABLE `__new_coach_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`sender_id` text NOT NULL,
	`receiver_id` text NOT NULL,
	`content` text NOT NULL,
	`sent_at` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_coach_messages`("id", "sender_id", "receiver_id", "content", "sent_at", "read_at") SELECT "id", "sender_id", "receiver_id", "content", "sent_at", "read_at" FROM `coach_messages`;--> statement-breakpoint
DROP TABLE `coach_messages`;--> statement-breakpoint
ALTER TABLE `__new_coach_messages` RENAME TO `coach_messages`;--> statement-breakpoint
CREATE TABLE `__new_daily_check_ins` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`date` text NOT NULL,
	`workout_completed` integer DEFAULT false NOT NULL,
	`nutrition_completed` integer DEFAULT false NOT NULL,
	`hydration_completed` integer DEFAULT false NOT NULL,
	`streak_day` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_daily_check_ins`("id", "athlete_id", "date", "workout_completed", "nutrition_completed", "hydration_completed", "streak_day") SELECT "id", "athlete_id", "date", "workout_completed", "nutrition_completed", "hydration_completed", "streak_day" FROM `daily_check_ins`;--> statement-breakpoint
DROP TABLE `daily_check_ins`;--> statement-breakpoint
ALTER TABLE `__new_daily_check_ins` RENAME TO `daily_check_ins`;--> statement-breakpoint
CREATE UNIQUE INDEX `checkin_athlete_date` ON `daily_check_ins` (`athlete_id`,`date`);--> statement-breakpoint
CREATE TABLE `__new_ai_context_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`snapshot_type` text NOT NULL,
	`payload` text NOT NULL,
	`token_estimate` integer,
	`created_at` integer NOT NULL,
	`expires_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_ai_context_snapshots`("id", "athlete_id", "snapshot_type", "payload", "token_estimate", "created_at", "expires_at") SELECT "id", "athlete_id", "snapshot_type", "payload", "token_estimate", "created_at", "expires_at" FROM `ai_context_snapshots`;--> statement-breakpoint
DROP TABLE `ai_context_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_ai_context_snapshots` RENAME TO `ai_context_snapshots`;--> statement-breakpoint
CREATE TABLE `__new_ai_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`recommendation_id` text NOT NULL,
	`athlete_id` text NOT NULL,
	`rating` integer NOT NULL,
	`comment` text,
	`given_at` integer NOT NULL,
	FOREIGN KEY (`recommendation_id`) REFERENCES `ai_recommendations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ai_feedback`("id", "recommendation_id", "athlete_id", "rating", "comment", "given_at") SELECT "id", "recommendation_id", "athlete_id", "rating", "comment", "given_at" FROM `ai_feedback`;--> statement-breakpoint
DROP TABLE `ai_feedback`;--> statement-breakpoint
ALTER TABLE `__new_ai_feedback` RENAME TO `ai_feedback`;--> statement-breakpoint
CREATE TABLE `__new_ai_recommendations` (
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
	`applied_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_ai_recommendations`("id", "athlete_id", "type", "title", "body", "context_snapshot", "priority", "model", "generated_at", "read_at", "dismissed_at", "applied_at") SELECT "id", "athlete_id", "type", "title", "body", "context_snapshot", "priority", "model", "generated_at", "read_at", "dismissed_at", "applied_at" FROM `ai_recommendations`;--> statement-breakpoint
DROP TABLE `ai_recommendations`;--> statement-breakpoint
ALTER TABLE `__new_ai_recommendations` RENAME TO `ai_recommendations`;