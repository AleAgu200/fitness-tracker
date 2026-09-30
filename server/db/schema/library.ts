import { bigint, boolean, doublePrecision, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const libraryFoods = pgTable("library_foods", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  kcal: doublePrecision("kcal").notNull(),
  proteinG: doublePrecision("proteinG").notNull(),
  carbsG: doublePrecision("carbsG").notNull(),
  fatG: doublePrecision("fatG").notNull(),
  source: text("source").notNull().default("base"),
  externalId: text("externalId"),
  createdBy: text("createdBy").references(() => user.id, { onDelete: "set null" }),
  createdAt: milliseconds("createdAt").notNull(),
});

export const libraryExercises = pgTable("library_exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  muscleGroup: text("muscleGroup").notNull(),
  equipment: text("equipment").notNull(),
  instructions: text("instructions"),
  source: text("source").notNull().default("base"),
  externalId: text("externalId"),
  mediaUrl: text("mediaUrl"),
  createdBy: text("createdBy").references(() => user.id, { onDelete: "set null" }),
  createdAt: milliseconds("createdAt").notNull(),
});

/**
 * Products looked up by barcode in Open Food Facts, cached so repeated scans
 * don't hit the public API. Only the catalog's own public data lives here —
 * never anything about who scanned it. Misses are cached briefly too.
 */
export const foodBarcodeCache = pgTable("food_barcode_cache", {
  barcode: text("barcode").primaryKey(),
  found: boolean("found").notNull(),
  product: jsonb("product").$type<unknown>(),
  fetchedAt: milliseconds("fetchedAt").notNull(),
});
