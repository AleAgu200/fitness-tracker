import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

/**
 * A user reporting another one (today: an athlete reporting a professional they talk to).
 * `evidence` is a snapshot of the conversation's last messages at report time, so the
 * review doesn't depend on messages the reported user could still change.
 */
export const userReports = pgTable("user_reports", {
  id: text("id").primaryKey(),
  reporterId: text("reporterId").notNull().references(() => user.id, { onDelete: "cascade" }),
  reportedUserId: text("reportedUserId").notNull().references(() => user.id, { onDelete: "cascade" }),
  reason: text("reason").notNull(),
  detail: text("detail"),
  evidence: jsonb("evidence").$type<unknown>(),
  status: text("status").notNull().default("open"),
  createdAt: milliseconds("createdAt").notNull(),
  resolvedAt: milliseconds("resolvedAt"),
  resolvedBy: text("resolvedBy").references(() => user.id, { onDelete: "set null" }),
  resolutionNote: text("resolutionNote"),
}, (table) => [
  check("user_reports_reason_check", sql`${table.reason} in ('harassment', 'inappropriate', 'spam', 'unsafe_advice', 'other')`),
  check("user_reports_status_check", sql`${table.status} in ('open', 'resolved', 'dismissed')`),
  index("user_reports_status_created").on(table.status, table.createdAt),
  index("user_reports_reporter_created").on(table.reporterId, table.createdAt),
]);
