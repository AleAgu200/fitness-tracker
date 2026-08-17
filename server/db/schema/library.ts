import { bigint, doublePrecision, pgTable, text } from "drizzle-orm/pg-core";

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
