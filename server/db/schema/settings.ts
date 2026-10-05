import { bigint, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

/** App-wide settings the admin panel edits, one row per key (e.g. "ads"). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
  updatedBy: text("updatedBy").references(() => user.id, { onDelete: "set null" }),
});
