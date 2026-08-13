CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"role" text DEFAULT 'athlete' NOT NULL,
	"isSuperAdmin" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone,
	"updatedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "athlete_profiles" (
	"userId" text PRIMARY KEY NOT NULL,
	"fullName" text NOT NULL,
	"sex" text,
	"dateOfBirth" text,
	"heightCm" double precision,
	"goalWeightKg" double precision,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "athlete_profiles_sex_check" CHECK ("athlete_profiles"."sex" is null or "athlete_profiles"."sex" in ('M', 'F', 'X'))
);
--> statement-breakpoint
CREATE TABLE "body_measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"measuredAt" bigint NOT NULL,
	"weightKg" double precision NOT NULL,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_generation_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"inputHash" text NOT NULL,
	"requestJson" jsonb,
	"status" text NOT NULL,
	"phase" text NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"runCount" integer DEFAULT 0 NOT NULL,
	"upstreamCalls" integer DEFAULT 0 NOT NULL,
	"resultJson" jsonb,
	"errorCode" text,
	"errorRetryable" boolean,
	"timingsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"leaseOwner" text,
	"leaseExpiresAt" bigint,
	"createdAt" bigint NOT NULL,
	"startedAt" bigint,
	"phaseStartedAt" bigint,
	"completedAt" bigint,
	"updatedAt" bigint NOT NULL,
	"durationMs" bigint,
	"consumedAt" bigint,
	CONSTRAINT "plan_generation_jobs_status_check" CHECK ("plan_generation_jobs"."status" in ('queued', 'running', 'succeeded', 'requires_review', 'failed')),
	CONSTRAINT "plan_generation_jobs_phase_check" CHECK ("plan_generation_jobs"."phase" in ('queued', 'preparing', 'generating', 'validating', 'completed'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "body_measurements" ADD CONSTRAINT "body_measurements_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_generation_jobs" ADD CONSTRAINT "plan_generation_jobs_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_unique" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_unique" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "body_measurements_athlete_date" ON "body_measurements" USING btree ("athleteId","measuredAt" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "plan_generation_jobs_one_active_user" ON "plan_generation_jobs" USING btree ("userId") WHERE "plan_generation_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "plan_generation_jobs_user_current" ON "plan_generation_jobs" USING btree ("userId","consumedAt","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "plan_generation_jobs_stale_lease" ON "plan_generation_jobs" USING btree ("status","leaseExpiresAt");