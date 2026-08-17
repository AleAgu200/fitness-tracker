import { sql } from "drizzle-orm";
import { bigint, bigserial, check, doublePrecision, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const syncDevices = pgTable("sync_devices", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("active_writer"),
  schemaVersion: integer("schemaVersion").notNull(),
  lastAckSequence: bigint("lastAckSequence", { mode: "number" }).notNull().default(0),
  registeredAt: milliseconds("registeredAt").notNull(),
  lastSeenAt: milliseconds("lastSeenAt").notNull(),
  replacedAt: milliseconds("replacedAt"),
  revokedAt: milliseconds("revokedAt"),
}, (table) => [
  check("sync_devices_status_check", sql`${table.status} in ('active_writer', 'replaced', 'revoked')`),
  uniqueIndex("sync_devices_one_active_writer")
    .on(table.athleteId)
    .where(sql`${table.status} = 'active_writer'`),
  index("sync_devices_athlete_status").on(table.athleteId, table.status),
]);

export const syncMutations = pgTable("sync_mutations", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  deviceId: text("deviceId").notNull().references(() => syncDevices.id, { onDelete: "restrict" }),
  mutationId: text("mutationId").notNull(),
  serverSequence: bigserial("serverSequence", { mode: "number" }).notNull(),
  schemaVersion: integer("schemaVersion").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  operation: text("operation").notNull(),
  status: text("status").notNull(),
  errorCode: text("errorCode"),
  occurredAt: milliseconds("occurredAt").notNull(),
  receivedAt: milliseconds("receivedAt").notNull(),
}, (table) => [
  check("sync_mutations_operation_check", sql`${table.operation} in ('create', 'update', 'delete')`),
  check("sync_mutations_status_check", sql`${table.status} in ('acked', 'retryable', 'rejected')`),
  uniqueIndex("sync_mutations_idempotency_unique").on(table.athleteId, table.deviceId, table.mutationId),
  uniqueIndex("sync_mutations_server_sequence_unique").on(table.serverSequence),
  index("sync_mutations_entity_order").on(table.athleteId, table.deviceId, table.entityType, table.entityId, table.receivedAt),
]);

export const syncChanges = pgTable("sync_changes", {
  serverSequence: bigserial("serverSequence", { mode: "number" }).primaryKey(),
  id: text("id").notNull(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  operation: text("operation").notNull(),
  payload: jsonb("payload").$type<unknown>(),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  check("sync_changes_operation_check", sql`${table.operation} in ('create', 'update', 'delete')`),
  uniqueIndex("sync_changes_id_unique").on(table.id),
  index("sync_changes_athlete_sequence").on(table.athleteId, table.serverSequence),
]);

export const trainingSessions = pgTable("training_sessions", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  deviceId: text("deviceId").notNull().references(() => syncDevices.id, { onDelete: "restrict" }),
  plannedSessionId: text("plannedSessionId"),
  status: text("status").notNull(),
  startedAt: milliseconds("startedAt").notNull(),
  completedAt: milliseconds("completedAt"),
  durationSeconds: integer("durationSeconds"),
  totalVolumeKg: doublePrecision("totalVolumeKg").notNull().default(0),
  version: integer("version").notNull().default(1),
  supersedesId: text("supersedesId"),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  check("training_sessions_status_check", sql`${table.status} in ('completed', 'skipped')`),
  index("training_sessions_athlete_date").on(table.athleteId, table.startedAt),
]);

export const trainingSets = pgTable("training_sets", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  sessionId: text("sessionId").notNull().references(() => trainingSessions.id, { onDelete: "restrict" }),
  exerciseName: text("exerciseName").notNull(),
  setIndex: integer("setIndex").notNull(),
  reps: integer("reps").notNull(),
  weightKg: doublePrecision("weightKg").notNull(),
  isPersonalRecord: integer("isPersonalRecord").notNull().default(0),
  completedAt: milliseconds("completedAt").notNull(),
  version: integer("version").notNull().default(1),
  supersedesId: text("supersedesId"),
}, (table) => [
  index("training_sets_session_index").on(table.sessionId, table.setIndex),
  index("training_sets_athlete_date").on(table.athleteId, table.completedAt),
]);

export const nutritionEntries = pgTable("nutrition_entries", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  deviceId: text("deviceId").notNull().references(() => syncDevices.id, { onDelete: "restrict" }),
  mealKey: text("mealKey").notNull(),
  status: text("status").notNull(),
  note: text("note"),
  occurredAt: milliseconds("occurredAt").notNull(),
  version: integer("version").notNull().default(1),
  supersedesId: text("supersedesId"),
  deletedAt: milliseconds("deletedAt"),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  check("nutrition_entries_status_check", sql`${table.status} in ('completed', 'substituted', 'pending', 'added', 'omitted')`),
  index("nutrition_entries_athlete_date").on(table.athleteId, table.occurredAt),
]);

export const athleteDailySummaries = pgTable("athlete_daily_summaries", {
  id: text("id").primaryKey(),
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "restrict" }),
  date: text("date").notNull(),
  trainingCompleted: integer("trainingCompleted").notNull().default(0),
  trainingSkipped: integer("trainingSkipped").notNull().default(0),
  totalVolumeKg: doublePrecision("totalVolumeKg").notNull().default(0),
  mealsCompleted: integer("mealsCompleted").notNull().default(0),
  mealsSubstituted: integer("mealsSubstituted").notNull().default(0),
  mealsPending: integer("mealsPending").notNull().default(0),
  latestWeightKg: doublePrecision("latestWeightKg"),
  checkinsSubmitted: integer("checkinsSubmitted").notNull().default(0),
  trainingFreshAt: milliseconds("trainingFreshAt"),
  nutritionFreshAt: milliseconds("nutritionFreshAt"),
  metricsFreshAt: milliseconds("metricsFreshAt"),
  checkinsFreshAt: milliseconds("checkinsFreshAt"),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  uniqueIndex("athlete_daily_summaries_athlete_date_unique").on(table.athleteId, table.date),
  index("athlete_daily_summaries_date").on(table.athleteId, table.date),
]);
