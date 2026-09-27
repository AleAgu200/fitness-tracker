CREATE TABLE "shared_session_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"sessionId" text NOT NULL,
	"type" text NOT NULL,
	"metric" jsonb NOT NULL,
	"earnedAt" bigint NOT NULL,
	"sharedAt" bigint NOT NULL,
	"unsharedAt" bigint,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "shared_session_cards_type_check" CHECK ("shared_session_cards"."type" in ('new_pulse', 'control', 'return', 'consistency'))
);
--> statement-breakpoint
CREATE TABLE "athlete_plan_selections" (
	"athleteId" text PRIMARY KEY NOT NULL,
	"coachPlanSelected" boolean NOT NULL,
	"selectedAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"pseudonym" text NOT NULL,
	"status" text NOT NULL,
	"requestedAt" bigint NOT NULL,
	"purgeAfter" bigint NOT NULL,
	"cancelledAt" bigint,
	"completedAt" bigint,
	"pausedClientIds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "account_deletions_status_check" CHECK ("account_deletions"."status" in ('pending', 'cancelled', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "shared_session_cards" ADD CONSTRAINT "shared_session_cards_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "athlete_plan_selections" ADD CONSTRAINT "athlete_plan_selections_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "shared_session_cards_athlete_earned" ON "shared_session_cards" USING btree ("athleteId","earnedAt");
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_one_pending_user" ON "account_deletions" USING btree ("userId") WHERE "account_deletions"."status" = 'pending';
--> statement-breakpoint
CREATE INDEX "account_deletions_due" ON "account_deletions" USING btree ("status","purgeAfter");
