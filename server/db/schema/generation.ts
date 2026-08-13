import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const planGenerationJobs = pgTable("plan_generation_jobs", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  inputHash: text("inputHash").notNull(),
  requestJson: jsonb("requestJson").$type<unknown>(),
  status: text("status").notNull(),
  phase: text("phase").notNull(),
  attempt: integer("attempt").notNull().default(0),
  runCount: integer("runCount").notNull().default(0),
  upstreamCalls: integer("upstreamCalls").notNull().default(0),
  resultJson: jsonb("resultJson").$type<unknown>(),
  errorCode: text("errorCode"),
  errorRetryable: boolean("errorRetryable"),
  timingsJson: jsonb("timingsJson").$type<unknown>().notNull().default([]),
  leaseOwner: text("leaseOwner"),
  leaseExpiresAt: milliseconds("leaseExpiresAt"),
  createdAt: milliseconds("createdAt").notNull(),
  startedAt: milliseconds("startedAt"),
  phaseStartedAt: milliseconds("phaseStartedAt"),
  completedAt: milliseconds("completedAt"),
  updatedAt: milliseconds("updatedAt").notNull(),
  durationMs: milliseconds("durationMs"),
  consumedAt: milliseconds("consumedAt"),
}, (table) => [
  check("plan_generation_jobs_status_check", sql`${table.status} in ('queued', 'running', 'succeeded', 'requires_review', 'failed')`),
  check("plan_generation_jobs_phase_check", sql`${table.phase} in ('queued', 'preparing', 'generating', 'validating', 'completed')`),
  uniqueIndex("plan_generation_jobs_one_active_user").on(table.userId).where(sql`${table.status} in ('queued', 'running')`),
  index("plan_generation_jobs_user_current").on(table.userId, table.consumedAt, table.createdAt.desc()),
  index("plan_generation_jobs_stale_lease").on(table.status, table.leaseExpiresAt),
]);
