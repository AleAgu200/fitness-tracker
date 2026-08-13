import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const pushDevices = pgTable("push_devices", {
  expoPushToken: text("expoPushToken").primaryKey(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  index("push_user").on(table.userId),
]);
