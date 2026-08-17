import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { careAssignments } from "./care";
import { organizations } from "./organizations";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const assignedWorkouts = pgTable("assigned_workouts", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "cascade" }),
  coachId: text("coachId").notNull().references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organizationId").references(() => organizations.id, { onDelete: "restrict" }),
  careAssignmentId: text("careAssignmentId").references(() => careAssignments.id, { onDelete: "restrict" }),
  payload: jsonb("payload").$type<unknown>().notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: milliseconds("createdAt").notNull(),
  effectiveAt: milliseconds("effectiveAt"),
  endsAt: milliseconds("endsAt"),
}, (table) => [
  check("assigned_workouts_status_check", sql`${table.status} in ('active', 'archived')`),
  index("aw_athlete").on(table.athleteId, table.status),
]);

export const assignedMealPlans = pgTable("assigned_meal_plans", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "cascade" }),
  nutritionistId: text("nutritionistId").notNull().references(() => user.id, { onDelete: "cascade" }),
  organizationId: text("organizationId").references(() => organizations.id, { onDelete: "restrict" }),
  careAssignmentId: text("careAssignmentId").references(() => careAssignments.id, { onDelete: "restrict" }),
  payload: jsonb("payload").$type<unknown>().notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: milliseconds("createdAt").notNull(),
  effectiveAt: milliseconds("effectiveAt"),
  endsAt: milliseconds("endsAt"),
}, (table) => [
  check("assigned_meal_plans_status_check", sql`${table.status} in ('active', 'archived')`),
  index("amp_athlete").on(table.athleteId, table.status),
]);
