CREATE TABLE "personal_backup_settings" (
	"userId" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"consentedAt" bigint,
	"disabledAt" bigint,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_backup_settings" ADD CONSTRAINT "personal_backup_settings_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "personal_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"revision" integer NOT NULL,
	"formatVersion" integer NOT NULL,
	"deviceId" text NOT NULL,
	"checksum" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"manifest" jsonb NOT NULL,
	"bootstrap" jsonb NOT NULL,
	"payload" bytea NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_backups" ADD CONSTRAINT "personal_backups_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_backups_user_revision" ON "personal_backups" USING btree ("userId","revision");
--> statement-breakpoint
CREATE INDEX "personal_backups_user_created" ON "personal_backups" USING btree ("userId","createdAt");
