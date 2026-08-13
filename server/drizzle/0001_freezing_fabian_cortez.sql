CREATE TABLE "library_exercises" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"muscleGroup" text NOT NULL,
	"equipment" text NOT NULL,
	"createdBy" text,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "library_foods" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"kcal" double precision NOT NULL,
	"proteinG" double precision NOT NULL,
	"carbsG" double precision NOT NULL,
	"fatG" double precision NOT NULL,
	"createdBy" text,
	"createdAt" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supervision_links" (
	"id" text PRIMARY KEY NOT NULL,
	"professionalId" text NOT NULL,
	"athleteId" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"inviteCode" text,
	"createdAt" bigint NOT NULL,
	"acceptedAt" bigint,
	CONSTRAINT "supervision_links_kind_check" CHECK ("supervision_links"."kind" in ('coach', 'nutritionist')),
	CONSTRAINT "supervision_links_status_check" CHECK ("supervision_links"."status" in ('pending', 'active', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"senderId" text NOT NULL,
	"receiverId" text NOT NULL,
	"content" text NOT NULL,
	"sentAt" bigint NOT NULL,
	"readAt" bigint
);
--> statement-breakpoint
CREATE TABLE "assigned_meal_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"nutritionistId" text NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "assigned_meal_plans_status_check" CHECK ("assigned_meal_plans"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "assigned_workouts" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"coachId" text NOT NULL,
	"payload" jsonb NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" bigint NOT NULL,
	CONSTRAINT "assigned_workouts_status_check" CHECK ("assigned_workouts"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"expoPushToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"platform" text NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_exercises" ADD CONSTRAINT "library_exercises_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "library_foods" ADD CONSTRAINT "library_foods_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_links" ADD CONSTRAINT "supervision_links_professionalId_user_id_fk" FOREIGN KEY ("professionalId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervision_links" ADD CONSTRAINT "supervision_links_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_user_id_fk" FOREIGN KEY ("senderId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiverId_user_id_fk" FOREIGN KEY ("receiverId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD CONSTRAINT "assigned_meal_plans_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_meal_plans" ADD CONSTRAINT "assigned_meal_plans_nutritionistId_user_id_fk" FOREIGN KEY ("nutritionistId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD CONSTRAINT "assigned_workouts_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_workouts" ADD CONSTRAINT "assigned_workouts_coachId_user_id_fk" FOREIGN KEY ("coachId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supervision_links_invite_code_unique" ON "supervision_links" USING btree ("inviteCode");--> statement-breakpoint
CREATE INDEX "sl_athlete" ON "supervision_links" USING btree ("athleteId","status");--> statement-breakpoint
CREATE INDEX "sl_professional" ON "supervision_links" USING btree ("professionalId","status");--> statement-breakpoint
CREATE INDEX "msg_pair" ON "messages" USING btree ("senderId","receiverId","sentAt");--> statement-breakpoint
CREATE INDEX "msg_unread" ON "messages" USING btree ("receiverId","readAt");--> statement-breakpoint
CREATE INDEX "amp_athlete" ON "assigned_meal_plans" USING btree ("athleteId","status");--> statement-breakpoint
CREATE INDEX "aw_athlete" ON "assigned_workouts" USING btree ("athleteId","status");--> statement-breakpoint
CREATE INDEX "push_user" ON "push_devices" USING btree ("userId");