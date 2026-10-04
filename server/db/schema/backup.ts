import { bigint, boolean, customType, index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * The athlete's own consent to a personal backup. Independent of sharing with
 * professionals: enabling it shares nothing with a coach or nutritionist, and
 * revoking a professional's access never touches it.
 */
export const personalBackupSettings = pgTable("personal_backup_settings", {
  userId: text("userId").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  consentedAt: milliseconds("consentedAt"),
  disabledAt: milliseconds("disabledAt"),
  updatedAt: milliseconds("updatedAt").notNull(),
});

/**
 * Complete, verified copies of the phone's data, owner-only. Stored here
 * (private, in the database) rather than in the public media bucket. Each row
 * is one committed revision: its bootstrap (profile, onboarding, active plan
 * references) and full payload come from the same upload, so they can never
 * describe different moments. Deleting the account cascades to every copy.
 */
export const personalBackups = pgTable("personal_backups", {
  id: text("id").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull(),
  formatVersion: integer("formatVersion").notNull(),
  deviceId: text("deviceId").notNull(),
  /** SHA-256 (hex) of the exact payload JSON the phone produced. */
  checksum: text("checksum").notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  manifest: jsonb("manifest").$type<unknown>().notNull(),
  bootstrap: jsonb("bootstrap").$type<unknown>().notNull(),
  /** gzip of the payload JSON. */
  payload: bytea("payload").notNull(),
  createdAt: milliseconds("createdAt").notNull(),
}, (table) => [
  uniqueIndex("personal_backups_user_revision").on(table.userId, table.revision),
  index("personal_backups_user_created").on(table.userId, table.createdAt),
]);
