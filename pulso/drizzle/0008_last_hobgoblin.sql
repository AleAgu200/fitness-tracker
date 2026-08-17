CREATE TABLE `local_care_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`discipline` text NOT NULL,
	`primary_assignment` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `local_care_assignment_org` ON `local_care_assignments` (`athlete_id`,`organization_id`,`active`);--> statement-breakpoint
CREATE TABLE `local_sharing_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`category` text NOT NULL,
	`granted` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_sharing_consent_org_category` ON `local_sharing_consents` (`athlete_id`,`organization_id`,`category`);--> statement-breakpoint
CREATE TABLE `professional_checkin_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`schema_version` integer NOT NULL,
	`questions` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`received_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `professional_checkin_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`schema_version` integer NOT NULL,
	`answers` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `professional_checkin_requests`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `professional_checkin_response_request` ON `professional_checkin_responses` (`request_id`);--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`mutation_id` text PRIMARY KEY NOT NULL,
	`athlete_id` text NOT NULL,
	`schema_version` integer DEFAULT 2 NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`base_version` integer,
	`occurred_at` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`server_sequence` integer,
	`error_code` text,
	`next_attempt_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sync_outbox_ready` ON `sync_outbox` (`athlete_id`,`status`,`next_attempt_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `sync_outbox_entity_order` ON `sync_outbox` (`athlete_id`,`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`athlete_id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`cursor` text,
	`last_ack_sequence` integer DEFAULT 0 NOT NULL,
	`last_sync_at` integer,
	`last_success_at` integer,
	`last_error` text,
	`upgrade_required` integer DEFAULT false NOT NULL,
	`writer_conflict` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `body_measurements` ADD `sync_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `meal_log_entries` ADD `sync_version` integer DEFAULT 0 NOT NULL;