CREATE TABLE "nutrition_consumptions" (
	"id" text PRIMARY KEY NOT NULL,
	"athleteId" text NOT NULL,
	"deviceId" text NOT NULL,
	"localDate" text NOT NULL,
	"timezone" text,
	"occurredAt" bigint,
	"timePrecision" text NOT NULL,
	"version" integer NOT NULL,
	"kind" text NOT NULL,
	"mealLabel" text,
	"planSlotKey" text,
	"name" text NOT NULL,
	"amount" double precision,
	"unit" text,
	"source" text NOT NULL,
	"completeness" text NOT NULL,
	"nutrients" jsonb NOT NULL,
	"components" jsonb NOT NULL,
	"volumeMl" double precision,
	"plainWater" integer DEFAULT 0 NOT NULL,
	"legacyAggregate" integer DEFAULT 0 NOT NULL,
	"deletedAt" bigint,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "nutrition_consumptions_kind_check" CHECK ("nutrition_consumptions"."kind" in ('meal', 'food', 'beverage')),
	CONSTRAINT "nutrition_consumptions_unit_check" CHECK ("nutrition_consumptions"."unit" is null or "nutrition_consumptions"."unit" in ('g', 'ml'))
);
--> statement-breakpoint
ALTER TABLE "nutrition_consumptions" ADD CONSTRAINT "nutrition_consumptions_athleteId_user_id_fk" FOREIGN KEY ("athleteId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nutrition_consumptions_athlete_date" ON "nutrition_consumptions" USING btree ("athleteId","localDate");
