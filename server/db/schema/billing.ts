import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

const milliseconds = (name: string) => bigint(name, { mode: "number" });

/**
 * Server-side mirror of the athlete's RevenueCat entitlement.
 *
 * This table — not the client — is what authorizes paid work. AI generation
 * spends real money upstream, and a client-reported entitlement is trivially
 * forged, so every paid endpoint reads from here. Rows are written by the
 * RevenueCat webhook and by an on-demand sync that re-reads RevenueCat after a
 * purchase, which closes the gap while the webhook is still in flight.
 */
export const subscriptions = pgTable("subscriptions", {
  userId: text("userId").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  entitlement: text("entitlement").notNull(),
  status: text("status").notNull(),
  productId: text("productId"),
  store: text("store"),
  // Sandbox purchases must never unlock paid features in production, but are
  // kept so TestFlight/internal testing can be inspected.
  isSandbox: boolean("isSandbox").notNull().default(false),
  currentPeriodEndsAt: milliseconds("currentPeriodEndsAt"),
  willRenew: boolean("willRenew").notNull().default(false),
  /** Last RevenueCat event applied, so replayed webhooks are no-ops. */
  lastEventId: text("lastEventId"),
  lastEventAt: milliseconds("lastEventAt"),
  lastPayload: jsonb("lastPayload").$type<unknown>(),
  createdAt: milliseconds("createdAt").notNull(),
  updatedAt: milliseconds("updatedAt").notNull(),
}, (table) => [
  check(
    "subscriptions_status_check",
    sql`${table.status} in ('active', 'in_grace_period', 'billing_issue', 'expired', 'cancelled', 'paused')`,
  ),
  index("subscriptions_status_period").on(table.status, table.currentPeriodEndsAt),
]);

/** Append-only log of RevenueCat deliveries, for idempotency and support. */
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(),
  userId: text("userId").references(() => user.id, { onDelete: "set null" }),
  eventType: text("eventType").notNull(),
  appUserId: text("appUserId"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  receivedAt: milliseconds("receivedAt").notNull(),
}, (table) => [
  uniqueIndex("billing_events_id_unique").on(table.id),
  index("billing_events_user_time").on(table.userId, table.receivedAt),
]);
