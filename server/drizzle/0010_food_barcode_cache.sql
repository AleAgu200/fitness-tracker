CREATE TABLE "food_barcode_cache" (
	"barcode" text PRIMARY KEY NOT NULL,
	"found" boolean NOT NULL,
	"product" jsonb,
	"fetchedAt" bigint NOT NULL
);
