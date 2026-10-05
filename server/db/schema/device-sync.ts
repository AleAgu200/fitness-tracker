import { sql } from "drizzle-orm";
import { bigint, boolean, index, jsonb, pgTable, primaryKey, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

/**
 * The latest version of every record an athlete syncs between devices
 * (PULSO Plus, with consent). One row per (athlete, table, record ID); a
 * deletion stays as a tombstone so every device removes it. `seq` grows on
 * every accepted change and is the pull cursor. Deleting the account cascades.
 */
export const athleteRecords = pgTable("athlete_records", {
  athleteId: text("athleteId").notNull().references(() => user.id, { onDelete: "cascade" }),
  tableName: text("tableName").notNull(),
  recordId: text("recordId").notNull(),
  payload: jsonb("payload").$type<unknown>(),
  deleted: boolean("deleted").notNull().default(false),
  /** Device clock of the change; the most recent wins. */
  changedAt: milliseconds("changedAt").notNull(),
  deviceId: text("deviceId").notNull(),
  seq: bigint("seq", { mode: "number" }).notNull().default(sql`nextval('athlete_records_seq')`),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  primaryKey({ columns: [table.athleteId, table.tableName, table.recordId] }),
  index("athlete_records_pull").on(table.athleteId, table.seq),
]);
