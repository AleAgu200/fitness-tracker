import { sql } from "drizzle-orm";
import { bigint, check, doublePrecision, index, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const athleteProfiles = pgTable("athlete_profiles", {
  userId: text("userId").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  fullName: text("fullName").notNull(),
  sex: text("sex"),
  dateOfBirth: text("dateOfBirth"),
  heightCm: doublePrecision("heightCm"),
  goalWeightKg: doublePrecision("goalWeightKg"),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  check("athlete_profiles_sex_check", sql`${table.sex} is null or ${table.sex} in ('M', 'F', 'X')`),
]);

export const bodyMeasurements = pgTable("body_measurements", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "cascade" }),
  measuredAt: milliseconds("measuredAt").notNull(),
  weightKg: doublePrecision("weightKg").notNull(),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  index("body_measurements_athlete_date").on(table.athleteId, table.measuredAt.desc()),
]);
