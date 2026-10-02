ALTER TABLE "user" ADD COLUMN "professionalStatus" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspendedAt" timestamp with time zone;
--> statement-breakpoint
-- Professionals that exist before reviews do keep working.
UPDATE "user" SET "professionalStatus" = 'approved' WHERE "role" IN ('coach', 'nutritionist');
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_professional_status_check" CHECK ("professionalStatus" IS NULL OR "professionalStatus" IN ('pending', 'approved', 'rejected'));
--> statement-breakpoint
CREATE TABLE "catalog_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"muscleGroup" text NOT NULL,
	"equipment" text NOT NULL,
	"target" text NOT NULL,
	"secondaryMuscles" jsonb NOT NULL,
	"instructions" text NOT NULL,
	"mediaPath" text,
	"hidden" boolean DEFAULT false NOT NULL,
	"createdBy" text,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_exercises" ADD CONSTRAINT "catalog_exercises_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actorUserId" text,
	"action" text NOT NULL,
	"subjectType" text NOT NULL,
	"subjectId" text NOT NULL,
	"metadata" jsonb,
	"occurredAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_events" ADD CONSTRAINT "admin_audit_events_actorUserId_user_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_audit_events_subject_time" ON "admin_audit_events" USING btree ("subjectId","occurredAt");
