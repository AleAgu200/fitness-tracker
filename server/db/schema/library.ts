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

/**
 * Admin-curated layer over the static exercise catalog (lib/exercise-catalog.json).
 * A row whose id matches a catalog exercise overrides it (or hides it); any
 * other id is a new exercise. Search in the app and the portal merges both.
 */
export const catalogExercises = pgTable("catalog_exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  muscleGroup: text("muscleGroup").notNull(),
  equipment: text("equipment").notNull(),
  target: text("target").notNull(),
  secondaryMuscles: jsonb("secondaryMuscles").$type<string[]>().notNull(),
  instructions: text("instructions").notNull(),
  /** Public path of the animation (GIF, WebP or MP4) served by the backend. */
  mediaPath: text("mediaPath"),
  hidden: boolean("hidden").notNull().default(false),
  createdBy: text("createdBy").references(() => user.id, { onDelete: "set null" }),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
});

/**
 * What super admins did, for accountability. Kept apart from the
 * organization-scoped audit_events: admin actions have no organization.
 */
export const adminAuditEvents = pgTable("admin_audit_events", {
  id: text("id").primaryKey(),
  actorUserId: text("actorUserId").references(() => user.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  subjectType: text("subjectType").notNull(),
  subjectId: text("subjectId").notNull(),
  metadata: jsonb("metadata").$type<unknown>(),
  occurredAt: milliseconds("occurredAt").notNull(),
});
