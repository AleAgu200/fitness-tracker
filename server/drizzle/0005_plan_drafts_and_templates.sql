CREATE TABLE "plan_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"discipline" text NOT NULL,
	"name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"createdByMembershipId" text NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	"archivedAt" bigint,
	CONSTRAINT "plan_templates_discipline_check" CHECK ("plan_templates"."discipline" in ('coach', 'nutritionist'))
);
--> statement-breakpoint
CREATE TABLE "plan_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"organizationClientId" text NOT NULL,
	"athleteId" text NOT NULL,
	"discipline" text NOT NULL,
	"authorMembershipId" text NOT NULL,
	"sourceTemplateId" text,
	"baseVersion" integer NOT NULL,
	"name" text,
	"payload" jsonb NOT NULL,
	"effectiveAt" bigint,
	"endsAt" bigint,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "plan_drafts_discipline_check" CHECK ("plan_drafts"."discipline" in ('coach', 'nutritionist'))
);
--> statement-breakpoint
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_createdByMembershipId_organization_memberships_id_fk" FOREIGN KEY ("createdByMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_organizationClientId_organization_clients_id_fk" FOREIGN KEY ("organizationClientId") REFERENCES "public"."organization_clients"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_authorMembershipId_organization_memberships_id_fk" FOREIGN KEY ("authorMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_drafts" ADD CONSTRAINT "plan_drafts_sourceTemplateId_plan_templates_id_fk" FOREIGN KEY ("sourceTemplateId") REFERENCES "public"."plan_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "plan_templates_org_discipline" ON "plan_templates" USING btree ("organizationId","discipline","archivedAt");
--> statement-breakpoint
CREATE UNIQUE INDEX "plan_drafts_client_discipline_unique" ON "plan_drafts" USING btree ("organizationClientId","discipline");
--> statement-breakpoint
CREATE INDEX "plan_drafts_athlete" ON "plan_drafts" USING btree ("athleteId","discipline");
--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD COLUMN "name" text;
--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD COLUMN "publishedByMembershipId" text;
--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD COLUMN "sourceTemplateId" text;
--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD COLUMN "name" text;
--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD COLUMN "publishedByMembershipId" text;
--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD COLUMN "sourceTemplateId" text;
--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD CONSTRAINT "assigned_workouts_publishedByMembershipId_organization_memberships_id_fk" FOREIGN KEY ("publishedByMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD CONSTRAINT "assigned_workouts_sourceTemplateId_plan_templates_id_fk" FOREIGN KEY ("sourceTemplateId") REFERENCES "public"."plan_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD CONSTRAINT "assigned_meal_plans_publishedByMembershipId_organization_memberships_id_fk" FOREIGN KEY ("publishedByMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD CONSTRAINT "assigned_meal_plans_sourceTemplateId_plan_templates_id_fk" FOREIGN KEY ("sourceTemplateId") REFERENCES "public"."plan_templates"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "aw_athlete_window" ON "assigned_workouts" USING btree ("athleteId","effectiveAt","endsAt");
--> statement-breakpoint
CREATE INDEX "amp_athlete_window" ON "assigned_meal_plans" USING btree ("athleteId","effectiveAt","endsAt");
--> statement-breakpoint
UPDATE "assigned_workouts" SET "effectiveAt" = "createdAt" WHERE "effectiveAt" IS NULL;
--> statement-breakpoint
UPDATE "assigned_meal_plans" SET "effectiveAt" = "createdAt" WHERE "effectiveAt" IS NULL;
