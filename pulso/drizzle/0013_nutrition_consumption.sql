CREATE TABLE `beverage_containers` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity_ml` real NOT NULL,
	`beverage_name` text DEFAULT 'Agua' NOT NULL,
	`plain_water` integer DEFAULT true NOT NULL,
	`saved_food_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `consumptions` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`local_date` text NOT NULL,
	`timezone` text,
	`occurred_at` integer,
	`time_precision` text DEFAULT 'exact' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`enqueued_version` integer DEFAULT 0 NOT NULL,
	`deleted_at` integer,
	`kind` text NOT NULL,
	`meal_label` text,
	`plan_slot_id` text,
	`name` text NOT NULL,
	`amount` real,
	`unit` text,
	`source` text NOT NULL,
	`completeness` text NOT NULL,
	`nutrients_json` text DEFAULT '{}' NOT NULL,
	`components_json` text DEFAULT '[]' NOT NULL,
	`volume_ml` real,
	`plain_water` integer DEFAULT false NOT NULL,
	`container_id` text,
	`legacy_aggregate` integer DEFAULT false NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `consumptions_athlete_date` ON `consumptions` (`athlete_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `nutrition_settings` (
	`athlete_id` text PRIMARY KEY NOT NULL,
	`water_goal_ml` real,
	`containers_seeded_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `saved_foods` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`source` text NOT NULL,
	`source_ref` text,
	`basis_amount` real NOT NULL,
	`basis_unit` text NOT NULL,
	`nutrients_json` text DEFAULT '{}' NOT NULL,
	`serving_label` text,
	`serving_amount` real,
	`favorite` integer DEFAULT false NOT NULL,
	`last_used_at` integer,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `consumptions` (`id`, `athlete_id`, `local_date`, `timezone`, `occurred_at`, `time_precision`, `version`, `enqueued_version`, `kind`, `meal_label`, `plan_slot_id`, `name`, `amount`, `unit`, `source`, `completeness`, `nutrients_json`, `components_json`, `volume_ml`, `plain_water`, `legacy_aggregate`, `note`, `created_at`, `updated_at`) SELECT 'legacy_meal_' || e.`id`, l.`athlete_id`, l.`date`, NULL, NULL, 'date_only', 1, 0, 'meal', s.`name`, e.`slot_id`, s.`default_name`, NULL, NULL, 'legacy', 'estimated', json_object('kcal', s.`target_kcal`, 'proteinG', s.`target_protein_g`, 'carbsG', s.`target_carbs_g`, 'fatG', s.`target_fat_g`), '[]', NULL, 0, 1, e.`substitute_note`, COALESCE(e.`logged_at`, l.`created_at`), COALESCE(e.`logged_at`, l.`created_at`) FROM `meal_log_entries` e JOIN `daily_nutrition_logs` l ON l.`id` = e.`daily_log_id` JOIN `meal_slots` s ON s.`id` = e.`slot_id` WHERE e.`status` IN ('completed', 'substituted');--> statement-breakpoint
INSERT INTO `consumptions` (`id`, `athlete_id`, `local_date`, `timezone`, `occurred_at`, `time_precision`, `version`, `enqueued_version`, `kind`, `meal_label`, `plan_slot_id`, `name`, `amount`, `unit`, `source`, `completeness`, `nutrients_json`, `components_json`, `volume_ml`, `plain_water`, `legacy_aggregate`, `note`, `created_at`, `updated_at`) SELECT 'legacy_water_' || w.`id`, w.`athlete_id`, w.`date`, NULL, NULL, 'date_only', 1, 0, 'beverage', NULL, NULL, 'Agua', w.`ml_total`, 'ml', 'legacy', 'estimated', json_object('kcal', 0, 'proteinG', 0, 'carbsG', 0, 'fatG', 0), '[]', w.`ml_total`, 1, 1, NULL, CAST((julianday(w.`date`) - 2440587.5) * 86400000 AS INTEGER), CAST((julianday(w.`date`) - 2440587.5) * 86400000 AS INTEGER) FROM `water_logs` w WHERE w.`ml_total` > 0;
