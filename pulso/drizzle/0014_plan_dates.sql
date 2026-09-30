CREATE TABLE `meal_slot_skips` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`slot_id`) REFERENCES `meal_slots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meal_slot_skip_slot_date` ON `meal_slot_skips` (`slot_id`,`date`);--> statement-breakpoint
ALTER TABLE `meal_slots` ADD `plan_date` text;