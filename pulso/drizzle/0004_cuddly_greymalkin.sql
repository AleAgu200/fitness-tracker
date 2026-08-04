CREATE TABLE `generation_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`goal` text,
	`pace` text,
	`experience_level` text,
	`days_per_week` integer,
	`session_minutes` integer,
	`activity_outside_training` text,
	`available_equipment` text,
	`training_location` text,
	`injuries_and_limitations` text,
	`excluded_exercises` text,
	`dietary_style` text,
	`allergies` text,
	`intolerances` text,
	`disliked_foods` text,
	`meals_per_day` integer,
	`preferred_meal_times` text,
	`cooking_time_budget` text,
	`budget_level` text,
	`honduras_latin_preference` integer,
	`is_pregnant_or_breastfeeding` integer,
	`has_eating_disorder_history` integer,
	`has_uncontrolled_medical_condition` integer,
	`consented_to_external_processing` integer DEFAULT false NOT NULL,
	`consented_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `onboarding_state` (
	`user_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`current_step` text,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL
);
