CREATE TABLE "user_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"reporterId" text NOT NULL,
	"reportedUserId" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"evidence" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"createdAt" bigint NOT NULL,
	"resolvedAt" bigint,
	"resolvedBy" text,
	"resolutionNote" text,
	CONSTRAINT "user_reports_reason_check" CHECK ("user_reports"."reason" in ('harassment', 'inappropriate', 'spam', 'unsafe_advice', 'other')),
	CONSTRAINT "user_reports_status_check" CHECK ("user_reports"."status" in ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporterId_user_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reportedUserId_user_id_fk" FOREIGN KEY ("reportedUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_resolvedBy_user_id_fk" FOREIGN KEY ("resolvedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_reports_status_created" ON "user_reports" USING btree ("status","createdAt");
--> statement-breakpoint
CREATE INDEX "user_reports_reporter_created" ON "user_reports" USING btree ("reporterId","createdAt");
