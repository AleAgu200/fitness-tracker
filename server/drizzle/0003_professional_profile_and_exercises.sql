CREATE TABLE "professional_profiles" (
	"userId" text PRIMARY KEY NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"bio" text DEFAULT '' NOT NULL,
	"phone" text,
	"location" text,
	"timezone" text DEFAULT 'America/Tegucigalpa' NOT NULL,
	"credentials" text DEFAULT '' NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_settings" (
	"userId" text PRIMARY KEY NOT NULL,
	"emailNotifications" boolean DEFAULT true NOT NULL,
	"attentionDigest" boolean DEFAULT true NOT NULL,
	"weeklySummary" boolean DEFAULT false NOT NULL,
	"defaultPortalSection" text DEFAULT 'attention' NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "professional_settings_default_section_check" CHECK ("professional_settings"."defaultPortalSection" in ('attention', 'athletes', 'exercises'))
);
--> statement-breakpoint
ALTER TABLE "library_exercises" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "library_exercises" ADD COLUMN "source" text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_exercises" ADD COLUMN "externalId" text;--> statement-breakpoint
ALTER TABLE "library_exercises" ADD COLUMN "mediaUrl" text;--> statement-breakpoint
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_settings" ADD CONSTRAINT "professional_settings_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
UPDATE "library_exercises" SET "source" = 'custom' WHERE "createdBy" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "professional_profiles" ("userId", "createdAt", "updatedAt")
SELECT "id", (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint
FROM "user" WHERE "role" IN ('coach', 'nutritionist')
ON CONFLICT ("userId") DO NOTHING;
--> statement-breakpoint
INSERT INTO "professional_settings" ("userId", "createdAt", "updatedAt")
SELECT "id", (extract(epoch from now()) * 1000)::bigint, (extract(epoch from now()) * 1000)::bigint
FROM "user" WHERE "role" IN ('coach', 'nutritionist')
ON CONFLICT ("userId") DO NOTHING;
