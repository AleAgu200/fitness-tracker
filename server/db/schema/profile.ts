import { sql } from "drizzle-orm";
import { bigint, boolean, check, doublePrecision, index, integer, pgTable, text } from "drizzle-orm/pg-core";

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
  version: integer("version").notNull().default(1),
  supersedesId: text("supersedesId"),
  sourceDeviceId: text("sourceDeviceId"),
  deletedAt: milliseconds("deletedAt"),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  index("body_measurements_athlete_date").on(table.athleteId, table.measuredAt.desc()),
]);

export const professionalProfiles = pgTable("professional_profiles", {
  userId: text("userId").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  headline: text("headline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  phone: text("phone"),
  location: text("location"),
  timezone: text("timezone").notNull().default("America/Tegucigalpa"),
  credentials: text("credentials").notNull().default(""),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
});

export const professionalSettings = pgTable("professional_settings", {
  userId: text("userId").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  emailNotifications: boolean("emailNotifications").notNull().default(true),
  attentionDigest: boolean("attentionDigest").notNull().default(true),
  weeklySummary: boolean("weeklySummary").notNull().default(false),
  defaultPortalSection: text("defaultPortalSection").notNull().default("attention"),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  check("professional_settings_default_section_check", sql`${table.defaultPortalSection} in ('attention', 'athletes', 'foods', 'exercises')`),
]);
