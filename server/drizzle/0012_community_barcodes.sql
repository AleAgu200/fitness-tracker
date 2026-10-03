CREATE TABLE "community_barcode_products" (
	"barcode" text NOT NULL,
	"userId" text NOT NULL,
	"product" jsonb NOT NULL,
	"createdAt" bigint NOT NULL,
	"updatedAt" bigint NOT NULL,
	CONSTRAINT "community_barcode_products_barcode_userId_pk" PRIMARY KEY("barcode","userId")
);
--> statement-breakpoint
ALTER TABLE "community_barcode_products" ADD CONSTRAINT "community_barcode_products_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "community_barcode_products_recent" ON "community_barcode_products" USING btree ("barcode","updatedAt");
