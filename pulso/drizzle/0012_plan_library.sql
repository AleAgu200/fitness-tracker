ALTER TABLE `programs` ADD `last_activated_at` integer;--> statement-breakpoint
ALTER TABLE `programs` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `origin` text DEFAULT 'own' NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `last_activated_at` integer;--> statement-breakpoint
ALTER TABLE `meal_plans` ADD `archived_at` integer;--> statement-breakpoint
UPDATE `programs` SET `last_activated_at` = `created_at` WHERE `active` = 1;--> statement-breakpoint
UPDATE `meal_plans` SET `last_activated_at` = `created_at` WHERE `active` = 1;
