import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const supervisionLinks = pgTable("supervision_links", {
  id: text("id").primaryKey(),
  professionalId: text("professionalId").notNull().references(() => user.id, { onDelete: "cascade" }),
  athleteId: text("athleteId").references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("pending"),
  inviteCode: text("inviteCode"),
  createdAt: milliseconds("createdAt").notNull(),
  acceptedAt: milliseconds("acceptedAt"),
}, (table) => [
  check("supervision_links_kind_check", sql`${table.kind} in ('coach', 'nutritionist')`),
  check("supervision_links_status_check", sql`${table.status} in ('pending', 'active', 'revoked')`),
  uniqueIndex("supervision_links_invite_code_unique").on(table.inviteCode),
  index("sl_athlete").on(table.athleteId, table.status),
  index("sl_professional").on(table.professionalId, table.status),
]);
