ALTER TABLE "library_foods" ADD COLUMN "source" text DEFAULT 'base' NOT NULL;
--> statement-breakpoint
ALTER TABLE "library_foods" ADD COLUMN "externalId" text;
--> statement-breakpoint
UPDATE "library_foods" SET "source" = 'custom' WHERE "createdBy" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "professional_settings" DROP CONSTRAINT "professional_settings_default_section_check";
--> statement-breakpoint
ALTER TABLE "professional_settings" ADD CONSTRAINT "professional_settings_default_section_check" CHECK ("professional_settings"."defaultPortalSection" in ('attention', 'athletes', 'foods', 'exercises'));
