CREATE TABLE "organization_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"orgRole" text DEFAULT 'professional' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invitedByMembershipId" text,
	"invitedAt" bigint NOT NULL,
	"activatedAt" bigint,
	"revokedAt" bigint,
	CONSTRAINT "organization_memberships_role_check" CHECK ("organization_memberships"."orgRole" in ('owner', 'admin', 'professional')),
	CONSTRAINT "organization_memberships_status_check" CHECK ("organization_memberships"."status" in ('invited', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "professional_capabilities" (
	"membershipId" text NOT NULL,
	"discipline" text NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "professional_capabilities_discipline_check" CHECK ("professional_capabilities"."discipline" in ('coach', 'nutritionist'))
);
--> statement-breakpoint
CREATE TABLE "attention_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"ownerAssignmentId" text NOT NULL,
	"checkinRequestId" text,
	"athleteId" text NOT NULL,
	"reasonCode" text NOT NULL,
	"dedupeKey" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"severity" text DEFAULT 'attention' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"suggestedAction" text,
	"openedAt" bigint NOT NULL,
	"acknowledgedAt" bigint,
	"resolvedAt" bigint,
	"resolutionNote" text,
	CONSTRAINT "attention_signals_severity_check" CHECK ("attention_signals"."severity" in ('info', 'attention', 'urgent')),
	CONSTRAINT "attention_signals_status_check" CHECK ("attention_signals"."status" in ('open', 'acknowledged', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"actorMembershipId" text,
	"actorUserId" text,
	"action" text NOT NULL,
	"subjectType" text NOT NULL,
	"subjectId" text NOT NULL,
	"metadata" jsonb,
	"occurredAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationClientId" text NOT NULL,
	"professionalMembershipId" text NOT NULL,
	"discipline" text NOT NULL,
	"primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" bigint NOT NULL,
	"revokedAt" bigint,
	CONSTRAINT "care_assignments_discipline_check" CHECK ("care_assignments"."discipline" in ('coach', 'nutritionist')),
	CONSTRAINT "care_assignments_status_check" CHECK ("care_assignments"."status" in ('active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "checkin_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"careAssignmentId" text NOT NULL,
	"athleteId" text NOT NULL,
	"templateVersionId" text NOT NULL,
	"dueAt" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdAt" bigint NOT NULL,
	"submittedAt" bigint,
	"reviewedAt" bigint,
	CONSTRAINT "checkin_requests_status_check" CHECK ("checkin_requests"."status" in ('pending', 'submitted', 'reviewed', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "checkin_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"requestId" text NOT NULL,
	"schemaVersion" integer NOT NULL,
	"answers" jsonb NOT NULL,
	"submittedAt" bigint NOT NULL,
	"supersedesId" text
);
--> statement-breakpoint
CREATE TABLE "checkin_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"requestId" text NOT NULL,
	"reviewerMembershipId" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "checkin_reviews_action_check" CHECK ("checkin_reviews"."action" in ('message', 'task', 'plan_adjustment', 'no_changes'))
);
--> statement-breakpoint
CREATE TABLE "checkin_template_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"discipline" text NOT NULL,
	"schemaVersion" integer NOT NULL,
	"questions" jsonb NOT NULL,
	"createdByMembershipId" text NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "checkin_template_versions_discipline_check" CHECK ("checkin_template_versions"."discipline" in ('coach', 'nutritionist'))
);
--> statement-breakpoint
CREATE TABLE "follow_up_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"attentionSignalId" text,
	"athleteId" text NOT NULL,
	"assigneeMembershipId" text,
	"createdByMembershipId" text NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"dueAt" bigint,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" bigint NOT NULL,
	"completedAt" bigint,
	CONSTRAINT "follow_up_tasks_status_check" CHECK ("follow_up_tasks"."status" in ('open', 'done', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "organization_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"athleteId" text NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"createdAt" bigint NOT NULL,
	"activatedAt" bigint,
	"pausedAt" bigint,
	"revokedAt" bigint,
	CONSTRAINT "organization_clients_status_check" CHECK ("organization_clients"."status" in ('invited', 'active', 'paused', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "professional_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationId" text NOT NULL,
	"athleteId" text NOT NULL,
	"authorMembershipId" text NOT NULL,
	"visibility" text DEFAULT 'author' NOT NULL,
	"body" text NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "professional_notes_visibility_check" CHECK ("professional_notes"."visibility" in ('author', 'care_team', 'athlete'))
);
--> statement-breakpoint
CREATE TABLE "sharing_consents" (
	"id" text PRIMARY KEY NOT NULL,
	"organizationClientId" text NOT NULL,
	"category" text NOT NULL,
	"grantedAt" bigint NOT NULL,
	"revokedAt" bigint,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "sharing_consents_category_check" CHECK ("sharing_consents"."category" in ('training', 'nutrition', 'metrics', 'checkins', 'photos'))
);
--> statement-breakpoint
CREATE TABLE "athlete_daily_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"date" text NOT NULL,
	"trainingCompleted" integer DEFAULT 0 NOT NULL,
	"trainingSkipped" integer DEFAULT 0 NOT NULL,
	"totalVolumeKg" double precision DEFAULT 0 NOT NULL,
	"mealsCompleted" integer DEFAULT 0 NOT NULL,
	"mealsSubstituted" integer DEFAULT 0 NOT NULL,
	"mealsPending" integer DEFAULT 0 NOT NULL,
	"latestWeightKg" double precision,
	"checkinsSubmitted" integer DEFAULT 0 NOT NULL,
	"trainingFreshAt" bigint,
	"nutritionFreshAt" bigint,
	"metricsFreshAt" bigint,
	"checkinsFreshAt" bigint,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nutrition_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"deviceId" text NOT NULL,
	"mealKey" text NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"occurredAt" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedesId" text,
	"deletedAt" bigint,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "nutrition_entries_status_check" CHECK ("nutrition_entries"."status" in ('completed', 'substituted', 'pending', 'added', 'omitted'))
);
--> statement-breakpoint
CREATE TABLE "sync_changes" (
	"serverSequence" bigserial PRIMARY KEY NOT NULL,
	"id" text NOT NULL,
	"athleteId" text NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"operation" text NOT NULL,
	"payload" jsonb,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "sync_changes_operation_check" CHECK ("sync_changes"."operation" in ('create', 'update', 'delete'))
);
--> statement-breakpoint
CREATE TABLE "sync_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"status" text DEFAULT 'active_writer' NOT NULL,
	"schemaVersion" integer NOT NULL,
	"lastAckSequence" bigint DEFAULT 0 NOT NULL,
	"registeredAt" bigint NOT NULL,
	"lastSeenAt" bigint NOT NULL,
	"replacedAt" bigint,
	"revokedAt" bigint,
	CONSTRAINT "sync_devices_status_check" CHECK ("sync_devices"."status" in ('active_writer', 'replaced', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "sync_mutations" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"deviceId" text NOT NULL,
	"mutationId" text NOT NULL,
	"serverSequence" bigserial NOT NULL,
	"schemaVersion" integer NOT NULL,
	"entityType" text NOT NULL,
	"entityId" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"errorCode" text,
	"occurredAt" bigint NOT NULL,
	"receivedAt" bigint NOT NULL,
	CONSTRAINT "sync_mutations_operation_check" CHECK ("sync_mutations"."operation" in ('create', 'update', 'delete')),
	CONSTRAINT "sync_mutations_status_check" CHECK ("sync_mutations"."status" in ('acked', 'retryable', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"deviceId" text NOT NULL,
	"plannedSessionId" text,
	"status" text NOT NULL,
	"startedAt" bigint NOT NULL,
	"completedAt" bigint,
	"durationSeconds" integer,
	"totalVolumeKg" double precision DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedesId" text,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "training_sessions_status_check" CHECK ("training_sessions"."status" in ('completed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "training_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"sessionId" text NOT NULL,
	"exerciseName" text NOT NULL,
	"setIndex" integer NOT NULL,
	"reps" integer NOT NULL,
	"weightKg" double precision NOT NULL,
	"isPersonalRecord" integer DEFAULT 0 NOT NULL,
	"completedAt" bigint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedesId" text
);
--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "supersedesId" text;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "sourceDeviceId" text;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD COLUMN "deletedAt" bigint;--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD COLUMN "careAssignmentId" text;--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD COLUMN "effectiveAt" bigint;--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD COLUMN "endsAt" bigint;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD COLUMN "organizationId" text;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD COLUMN "careAssignmentId" text;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD COLUMN "effectiveAt" bigint;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD COLUMN "endsAt" bigint;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_capabilities" ADD CONSTRAINT "professional_capabilities_membershipId_organization_memberships_id_fk" FOREIGN KEY ("membershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_ownerAssignmentId_care_assignments_id_fk" FOREIGN KEY ("ownerAssignmentId") REFERENCES "public"."care_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_checkinRequestId_checkin_requests_id_fk" FOREIGN KEY ("checkinRequestId") REFERENCES "public"."checkin_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attention_signals" ADD CONSTRAINT "attention_signals_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorMembershipId_organization_memberships_id_fk" FOREIGN KEY ("actorMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorUserId_user_id_fk" FOREIGN KEY ("actorUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_assignments" ADD CONSTRAINT "care_assignments_organizationClientId_organization_clients_id_fk" FOREIGN KEY ("organizationClientId") REFERENCES "public"."organization_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_assignments" ADD CONSTRAINT "care_assignments_professionalMembershipId_organization_memberships_id_fk" FOREIGN KEY ("professionalMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_requests" ADD CONSTRAINT "checkin_requests_careAssignmentId_care_assignments_id_fk" FOREIGN KEY ("careAssignmentId") REFERENCES "public"."care_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_requests" ADD CONSTRAINT "checkin_requests_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_requests" ADD CONSTRAINT "checkin_requests_templateVersionId_checkin_template_versions_id_fk" FOREIGN KEY ("templateVersionId") REFERENCES "public"."checkin_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_responses" ADD CONSTRAINT "checkin_responses_requestId_checkin_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."checkin_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_reviews" ADD CONSTRAINT "checkin_reviews_requestId_checkin_requests_id_fk" FOREIGN KEY ("requestId") REFERENCES "public"."checkin_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_reviews" ADD CONSTRAINT "checkin_reviews_reviewerMembershipId_organization_memberships_id_fk" FOREIGN KEY ("reviewerMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_template_versions" ADD CONSTRAINT "checkin_template_versions_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_template_versions" ADD CONSTRAINT "checkin_template_versions_createdByMembershipId_organization_memberships_id_fk" FOREIGN KEY ("createdByMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_attentionSignalId_attention_signals_id_fk" FOREIGN KEY ("attentionSignalId") REFERENCES "public"."attention_signals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_assigneeMembershipId_organization_memberships_id_fk" FOREIGN KEY ("assigneeMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_up_tasks" ADD CONSTRAINT "follow_up_tasks_createdByMembershipId_organization_memberships_id_fk" FOREIGN KEY ("createdByMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_clients" ADD CONSTRAINT "organization_clients_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_clients" ADD CONSTRAINT "organization_clients_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_notes" ADD CONSTRAINT "professional_notes_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_notes" ADD CONSTRAINT "professional_notes_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professional_notes" ADD CONSTRAINT "professional_notes_authorMembershipId_organization_memberships_id_fk" FOREIGN KEY ("authorMembershipId") REFERENCES "public"."organization_memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_consents" ADD CONSTRAINT "sharing_consents_organizationClientId_organization_clients_id_fk" FOREIGN KEY ("organizationClientId") REFERENCES "public"."organization_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_daily_summaries" ADD CONSTRAINT "athlete_daily_summaries_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ADD CONSTRAINT "nutrition_entries_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nutrition_entries" ADD CONSTRAINT "nutrition_entries_deviceId_sync_devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."sync_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_devices" ADD CONSTRAINT "sync_devices_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_deviceId_sync_devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."sync_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_deviceId_sync_devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."sync_devices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sets" ADD CONSTRAINT "training_sets_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sets" ADD CONSTRAINT "training_sets_sessionId_training_sessions_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."training_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_memberships_org_user_unique" ON "organization_memberships" USING btree ("organizationId","userId");--> statement-breakpoint
CREATE INDEX "organization_memberships_user_status" ON "organization_memberships" USING btree ("userId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "professional_capabilities_membership_discipline_unique" ON "professional_capabilities" USING btree ("membershipId","discipline");--> statement-breakpoint
CREATE UNIQUE INDEX "attention_signals_dedupe_unique" ON "attention_signals" USING btree ("organizationId","athleteId","dedupeKey");--> statement-breakpoint
CREATE INDEX "attention_signals_owner_status_opened" ON "attention_signals" USING btree ("ownerAssignmentId","status","openedAt");--> statement-breakpoint
CREATE INDEX "audit_events_org_subject_time" ON "audit_events" USING btree ("organizationId","subjectId","occurredAt");--> statement-breakpoint
CREATE INDEX "audit_events_actor_time" ON "audit_events" USING btree ("actorMembershipId","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "care_assignments_member_client_discipline_unique" ON "care_assignments" USING btree ("organizationClientId","professionalMembershipId","discipline");--> statement-breakpoint
CREATE UNIQUE INDEX "care_assignments_one_primary_active" ON "care_assignments" USING btree ("organizationClientId","discipline") WHERE "care_assignments"."primary" = true and "care_assignments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "care_assignments_membership_status" ON "care_assignments" USING btree ("professionalMembershipId","status");--> statement-breakpoint
CREATE INDEX "checkin_requests_athlete_status_due" ON "checkin_requests" USING btree ("athleteId","status","dueAt");--> statement-breakpoint
CREATE INDEX "checkin_requests_assignment_status" ON "checkin_requests" USING btree ("careAssignmentId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_responses_request_unique" ON "checkin_responses" USING btree ("requestId");--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_reviews_request_unique" ON "checkin_reviews" USING btree ("requestId");--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_template_versions_org_discipline_version_unique" ON "checkin_template_versions" USING btree ("organizationId","discipline","schemaVersion");--> statement-breakpoint
CREATE INDEX "follow_up_tasks_assignee_status_due" ON "follow_up_tasks" USING btree ("assigneeMembershipId","status","dueAt");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_clients_org_athlete_unique" ON "organization_clients" USING btree ("organizationId","athleteId");--> statement-breakpoint
CREATE INDEX "organization_clients_athlete_status" ON "organization_clients" USING btree ("athleteId","status");--> statement-breakpoint
CREATE INDEX "professional_notes_athlete_created" ON "professional_notes" USING btree ("athleteId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "sharing_consents_client_category_unique" ON "sharing_consents" USING btree ("organizationClientId","category");--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_daily_summaries_athlete_date_unique" ON "athlete_daily_summaries" USING btree ("athleteId","date");--> statement-breakpoint
CREATE INDEX "athlete_daily_summaries_date" ON "athlete_daily_summaries" USING btree ("athleteId","date");--> statement-breakpoint
CREATE INDEX "nutrition_entries_athlete_date" ON "nutrition_entries" USING btree ("athleteId","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_changes_id_unique" ON "sync_changes" USING btree ("id");--> statement-breakpoint
CREATE INDEX "sync_changes_athlete_sequence" ON "sync_changes" USING btree ("athleteId","serverSequence");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_devices_one_active_writer" ON "sync_devices" USING btree ("athleteId") WHERE "sync_devices"."status" = 'active_writer';--> statement-breakpoint
CREATE INDEX "sync_devices_athlete_status" ON "sync_devices" USING btree ("athleteId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_mutations_idempotency_unique" ON "sync_mutations" USING btree ("athleteId","deviceId","mutationId");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_mutations_server_sequence_unique" ON "sync_mutations" USING btree ("serverSequence");--> statement-breakpoint
CREATE INDEX "sync_mutations_entity_order" ON "sync_mutations" USING btree ("athleteId","deviceId","entityType","entityId","receivedAt");--> statement-breakpoint
CREATE INDEX "training_sessions_athlete_date" ON "training_sessions" USING btree ("athleteId","startedAt");--> statement-breakpoint
CREATE INDEX "training_sets_session_index" ON "training_sets" USING btree ("sessionId","setIndex");--> statement-breakpoint
CREATE INDEX "training_sets_athlete_date" ON "training_sets" USING btree ("athleteId","completedAt");--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD CONSTRAINT "assigned_meal_plans_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD CONSTRAINT "assigned_meal_plans_careAssignmentId_care_assignments_id_fk" FOREIGN KEY ("careAssignmentId") REFERENCES "public"."care_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD CONSTRAINT "assigned_workouts_organizationId_organizations_id_fk" FOREIGN KEY ("organizationId") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD CONSTRAINT "assigned_workouts_careAssignmentId_care_assignments_id_fk" FOREIGN KEY ("careAssignmentId") REFERENCES "public"."care_assignments"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- Additive, idempotent compatibility backfill. Each existing professional keeps an
-- independent organization; organizations are only merged through an explicit action.
INSERT INTO "organizations" ("id", "name", "createdAt", "updatedAt")
SELECT 'org_' || u."id", u."name" || ' · PULSO',
       (extract(epoch from now()) * 1000)::bigint,
       (extract(epoch from now()) * 1000)::bigint
FROM "user" u
WHERE u."role" IN ('coach', 'nutritionist')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "organization_memberships" (
  "id", "organizationId", "userId", "orgRole", "status", "invitedAt", "activatedAt"
)
SELECT 'mem_' || u."id", 'org_' || u."id", u."id", 'owner', 'active',
       (extract(epoch from u."createdAt") * 1000)::bigint,
       (extract(epoch from u."createdAt") * 1000)::bigint
FROM "user" u
WHERE u."role" IN ('coach', 'nutritionist')
ON CONFLICT ("organizationId", "userId") DO NOTHING;
--> statement-breakpoint
INSERT INTO "professional_capabilities" ("membershipId", "discipline", "createdAt")
SELECT 'mem_' || u."id", u."role", (extract(epoch from now()) * 1000)::bigint
FROM "user" u
WHERE u."role" IN ('coach', 'nutritionist')
ON CONFLICT ("membershipId", "discipline") DO NOTHING;
--> statement-breakpoint
INSERT INTO "organization_clients" (
  "id", "organizationId", "athleteId", "status", "createdAt", "activatedAt"
)
SELECT 'oc_' || sl."id", 'org_' || sl."professionalId", sl."athleteId", 'active',
       sl."createdAt", coalesce(sl."acceptedAt", sl."createdAt")
FROM "supervision_links" sl
WHERE sl."status" = 'active' AND sl."athleteId" IS NOT NULL
ON CONFLICT ("organizationId", "athleteId") DO NOTHING;
--> statement-breakpoint
INSERT INTO "care_assignments" (
  "id", "organizationClientId", "professionalMembershipId", "discipline", "primary", "status", "createdAt"
)
SELECT 'ca_' || sl."id", oc."id", 'mem_' || sl."professionalId", sl."kind", true, 'active',
       coalesce(sl."acceptedAt", sl."createdAt")
FROM "supervision_links" sl
JOIN "organization_clients" oc
  ON oc."organizationId" = 'org_' || sl."professionalId"
 AND oc."athleteId" = sl."athleteId"
WHERE sl."status" = 'active' AND sl."athleteId" IS NOT NULL
ON CONFLICT ("organizationClientId", "professionalMembershipId", "discipline") DO NOTHING;
--> statement-breakpoint
INSERT INTO "sharing_consents" ("id", "organizationClientId", "category", "grantedAt", "updatedAt")
SELECT 'consent_' || ca."id" || '_' || categories."category", ca."organizationClientId",
       categories."category", ca."createdAt", ca."createdAt"
FROM "care_assignments" ca
CROSS JOIN LATERAL (
  SELECT CASE ca."discipline" WHEN 'coach' THEN 'training' ELSE 'nutrition' END AS "category"
  UNION ALL SELECT 'checkins'
) categories
ON CONFLICT ("organizationClientId", "category") DO NOTHING;
--> statement-breakpoint
UPDATE "assigned_workouts" aw
SET "organizationId" = oc."organizationId",
    "careAssignmentId" = ca."id",
    "effectiveAt" = coalesce(aw."effectiveAt", aw."createdAt")
FROM "organization_clients" oc
JOIN "care_assignments" ca ON ca."organizationClientId" = oc."id" AND ca."discipline" = 'coach'
JOIN "organization_memberships" om ON om."id" = ca."professionalMembershipId"
WHERE aw."athleteId" = oc."athleteId" AND aw."coachId" = om."userId";
--> statement-breakpoint
UPDATE "assigned_meal_plans" amp
SET "organizationId" = oc."organizationId",
    "careAssignmentId" = ca."id",
    "effectiveAt" = coalesce(amp."effectiveAt", amp."createdAt")
FROM "organization_clients" oc
JOIN "care_assignments" ca ON ca."organizationClientId" = oc."id" AND ca."discipline" = 'nutritionist'
JOIN "organization_memberships" om ON om."id" = ca."professionalMembershipId"
WHERE amp."athleteId" = oc."athleteId" AND amp."nutritionistId" = om."userId";
