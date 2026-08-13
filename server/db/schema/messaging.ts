import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  senderId: text("senderId").notNull().references(() => user.id, { onDelete: "cascade" }),
  receiverId: text("receiverId").notNull().references(() => user.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  sentAt: milliseconds("sentAt").notNull(),
  readAt: milliseconds("readAt"),
}, (table) => [
  index("msg_pair").on(table.senderId, table.receiverId, table.sentAt),
  index("msg_unread").on(table.receiverId, table.readAt),
]);
