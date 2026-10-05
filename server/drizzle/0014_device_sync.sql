CREATE SEQUENCE IF NOT EXISTS "athlete_records_seq";
--> statement-breakpoint
CREATE TABLE "athlete_records" (
	"athleteId" text NOT NULL,
	"tableName" text NOT NULL,
	"recordId" text NOT NULL,
	"payload" jsonb,
	"deleted" boolean DEFAULT false NOT NULL,
	"changedAt" bigint NOT NULL,
	"deviceId" text NOT NULL,
	"seq" bigint DEFAULT nextval('athlete_records_seq') NOT NULL,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "athlete_records_athleteId_tableName_recordId_pk" PRIMARY KEY("athleteId","tableName","recordId")
);
--> statement-breakpoint
ALTER TABLE "athlete_records" ADD CONSTRAINT "athlete_records_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "athlete_records_pull" ON "athlete_records" USING btree ("athleteId","seq");
--> statement-breakpoint
ALTER TABLE "personal_backup_settings" ADD COLUMN "syncEnabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "personal_backup_settings" ADD COLUMN "syncConsentedAt" bigint;
--> statement-breakpoint
-- A device that syncs with the writer may also push professional data.
ALTER TABLE "sync_devices" DROP CONSTRAINT "sync_devices_status_check";
--> statement-breakpoint
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_status_check" CHECK ("sync_devices"."status" in ('active_writer', 'replaced', 'revoked', 'secondary'));
