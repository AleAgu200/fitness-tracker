import { eq } from "drizzle-orm";

import { db } from "@/db";
import { billingEvents, subscriptions } from "@/db/schema";
import { PULSO_PLUS } from "@/lib/entitlements";
import type { NormalizedEntitlement } from "@/lib/revenuecat-events";

export {
  normalizeEvent,
  verifyWebhookAuthorization,
  type NormalizedEntitlement,
  type RevenueCatEvent,
  type SubscriptionStatus,
} from "@/lib/revenuecat-events";

const API_BASE = "https://api.revenuecat.com/v1";

/** Persist an entitlement snapshot for a user. */
export async function applyEntitlement(input: {
  userId: string;
  entitlement: NormalizedEntitlement;
  eventId?: string | null;
  payload?: unknown;
}): Promise<void> {
  const now = Date.now();
  const values = {
    userId: input.userId,
    entitlement: PULSO_PLUS,
    status: input.entitlement.status,
    productId: input.entitlement.productId,
    store: input.entitlement.store,
    isSandbox: input.entitlement.isSandbox,
    currentPeriodEndsAt: input.entitlement.currentPeriodEndsAt,
    willRenew: input.entitlement.willRenew,
    lastEventId: input.eventId ?? null,
    lastEventAt: now,
    lastPayload: input.payload ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(subscriptions).values(values).onConflictDoUpdate({
    target: subscriptions.userId,
    set: {
      status: values.status,
      productId: values.productId,
      store: values.store,
      isSandbox: values.isSandbox,
      currentPeriodEndsAt: values.currentPeriodEndsAt,
      willRenew: values.willRenew,
      lastEventId: values.lastEventId,
      lastEventAt: values.lastEventAt,
      lastPayload: values.lastPayload,
      updatedAt: values.updatedAt,
    },
  });
}

/** Record the delivery. Returns false when this event was already applied. */
export async function recordEvent(input: {
  eventId: string;
  userId: string | null;
  eventType: string;
  appUserId: string | null;
  payload: unknown;
}): Promise<boolean> {
  const inserted = await db.insert(billingEvents).values({
    id: input.eventId,
    userId: input.userId,
    eventType: input.eventType,
    appUserId: input.appUserId,
    payload: input.payload,
    receivedAt: Date.now(),
  }).onConflictDoNothing().returning({ id: billingEvents.id });
  return inserted.length > 0;
}

/**
 * Read the subscriber straight from RevenueCat.
 *
 * Used right after a purchase: the webhook is asynchronous, and an athlete who
 * just paid should not be told to wait. Authoritative because the call is made
 * server-side with the secret key, never trusting what the app reports.
 */
export async function fetchSubscriber(appUserId: string): Promise<NormalizedEntitlement | null> {
  const apiKey = process.env.REVENUECAT_API_KEY;
  if (!apiKey) return null;

  const response = await fetch(`${API_BASE}/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) return null;

  const body = await response.json() as {
    subscriber?: {
      entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string; store?: string }>;
      subscriptions?: Record<string, { store?: string; is_sandbox?: boolean; unsubscribe_detected_at?: string | null }>;
    };
  };

  const entitlement = body.subscriber?.entitlements?.[PULSO_PLUS];
  if (!entitlement) return { status: "expired", productId: null, store: null, isSandbox: false, currentPeriodEndsAt: null, willRenew: false };

  const expiresAt = entitlement.expires_date ? Date.parse(entitlement.expires_date) : null;
  const productId = entitlement.product_identifier ?? null;
  const subscription = productId ? body.subscriber?.subscriptions?.[productId] : undefined;
  const active = expiresAt == null || expiresAt > Date.now();

  return {
    status: active ? "active" : "expired",
    productId,
    store: entitlement.store ?? subscription?.store ?? null,
    isSandbox: subscription?.is_sandbox === true,
    currentPeriodEndsAt: Number.isNaN(expiresAt) ? null : expiresAt,
    willRenew: active && !subscription?.unsubscribe_detected_at,
  };
}

export async function clearEntitlement(userId: string): Promise<void> {
  await db.update(subscriptions)
    .set({ status: "expired", willRenew: false, updatedAt: Date.now() })
    .where(eq(subscriptions.userId, userId));
}
