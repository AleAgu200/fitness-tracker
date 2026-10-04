ALTER TABLE `logged_sets` ADD `set_type` text DEFAULT 'working' NOT NULL;--> statement-breakpoint
ALTER TABLE `personal_records` ADD `e1rm_weight_kg` real;--> statement-breakpoint
ALTER TABLE `personal_records` ADD `e1rm_reps` integer;--> statement-breakpoint
ALTER TABLE `personal_records` ADD `e1rm_achieved_at` integer;