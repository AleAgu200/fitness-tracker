CREATE TABLE "athlete_meal_plan_selections" (
	"athleteId" text PRIMARY KEY NOT NULL,
	"nutritionistPlanSelected" boolean NOT NULL,
	"selectedAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "athlete_meal_plan_selections" ADD CONSTRAINT "athlete_meal_plan_selections_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
