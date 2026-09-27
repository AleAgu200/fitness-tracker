import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

/**
 * A session card the athlete explicitly shared with their care team. Cards
 * are created on the phone; only shared ones ever reach the server. Readers
 * still need the organization's `training` consent at read time, so revoking
 * consent hides cards without deleting them.
 */
export const sharedSessionCards = pgTable("shared_session_cards", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "cascade" }),
  sessionId: text("sessionId").notNull(),
  type: text("type").notNull(),
  metric: jsonb("metric").$type<unknown>().notNull(),
  earnedAt: milliseconds("earnedAt").notNull(),
  sharedAt: milliseconds("sharedAt").notNull(),
  unsharedAt: milliseconds("unsharedAt"),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  check("shared_session_cards_type_check", sql`${table.type} in ('new_pulse', 'control', 'return', 'consistency')`),
  index("shared_session_cards_athlete_earned").on(table.athleteId, table.earnedAt),
]);

/**
 * Which kind of plan the athlete currently trains on. Deliberately minimal:
 * the team learns whether the coach's plan is the selected one, never the
 * content of the athlete's other plans.
 */
export const athletePlanSelections = pgTable("athlete_plan_selections", {
  athleteId: text("athleteId").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  coachPlanSelected: boolean("coachPlanSelected").notNull(),
  selectedAt: milliseconds("selectedAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
});

/**
 * Account deletion lifecycle. Requested → (30-day grace, cancellable by the
 * athlete) → purged. No foreign key to `user` on purpose: the row outlives the
 * account as the proof that it was purged, with `userId` cleared and only a
 * pseudonym left.
 */
export const accountDeletions = pgTable("account_deletions", {
  id: text("id").primaryKey(),
  userId: text("userId"),
  pseudonym: text("pseudonym").notNull(),
  status: text("status").notNull(),
  requestedAt: milliseconds("requestedAt").notNull(),
  purgeAfter: milliseconds("purgeAfter").notNull(),
  cancelledAt: milliseconds("cancelledAt"),
  completedAt: milliseconds("completedAt"),
  /** Organization links paused by the request, restored if it's cancelled. */
  pausedClientIds: jsonb("pausedClientIds").$type<string[]>().notNull().default([]),
}, (table) => [
  check("account_deletions_status_check", sql`${table.status} in ('pending', 'cancelled', 'completed')`),
  uniqueIndex("account_deletions_one_pending_user").on(table.userId).where(sql`${table.status} = 'pending'`),
  index("account_deletions_due").on(table.status, table.purgeAfter),
]);
