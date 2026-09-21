CREATE TABLE "subscriptions" (
	"userId" text PRIMARY KEY NOT NULL,
	"entitlement" text NOT NULL,
	"status" text NOT NULL,
	"productId" text,
	"store" text,
	"isSandbox" boolean DEFAULT false NOT NULL,
	"currentPeriodEndsAt" bigint,
	"willRenew" boolean DEFAULT false NOT NULL,
	"lastEventId" text,
	"lastEventAt" bigint,
	"lastPayload" jsonb,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('active', 'in_grace_period', 'billing_issue', 'expired', 'cancelled', 'paused'))
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text,
	"eventType" text NOT NULL,
	"appUserId" text,
	"payload" jsonb NOT NULL,
	"receivedAt" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "subscriptions_status_period" ON "subscriptions" USING btree ("status","currentPeriodEndsAt");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_events_id_unique" ON "billing_events" USING btree ("id");
--> statement-breakpoint
CREATE INDEX "billing_events_user_time" ON "billing_events" USING btree ("userId","receivedAt");
