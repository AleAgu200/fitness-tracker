import { timingSafeEqual } from "crypto";

/**
 * Pure RevenueCat event handling, free of database access so it can be unit
 * tested without a live PostgreSQL — the same split as permissions-policy.ts.
 */

export type SubscriptionStatus =
  | "active"
  | "in_grace_period"
  | "billing_issue"
  | "expired"
  | "cancelled"
  | "paused";

/**
 * RevenueCat event types mapped to the status we store. Types we do not map
 * (TEST, TRANSFER, SUBSCRIBER_ALIAS…) never change entitlement on their own.
 */
const STATUS_BY_EVENT: Record<string, SubscriptionStatus> = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  PRODUCT_CHANGE: "active",
  UNCANCELLATION: "active",
  NON_RENEWING_PURCHASE: "active",
  SUBSCRIPTION_EXTENDED: "active",
  // CANCELLATION means auto-renew was turned off; access continues until the
  // period ends, so it must not revoke immediately.
  CANCELLATION: "cancelled",
  EXPIRATION: "expired",
  BILLING_ISSUE: "billing_issue",
  SUBSCRIPTION_PAUSED: "paused",
};

export interface NormalizedEntitlement {
  status: SubscriptionStatus;
  productId: string | null;
  store: string | null;
  isSandbox: boolean;
  currentPeriodEndsAt: number | null;
  willRenew: boolean;
}

export interface RevenueCatEvent {
  id?: string;
  type?: string;
  app_user_id?: string;
  product_id?: string;
  store?: string;
  environment?: string;
  expiration_at_ms?: number;
  cancel_reason?: string;
}

/** Constant-time check of the shared secret configured in RevenueCat. */
export function verifyWebhookAuthorization(header: string | null): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
  // An unset secret must reject everything rather than accept everything.
  if (!expected || !header) return false;
  const provided = Buffer.from(header);
  const secret = Buffer.from(expected);
  // Lengths are compared first because timingSafeEqual throws on a mismatch.
  return provided.length === secret.length && timingSafeEqual(provided, secret);
}

export function normalizeEvent(event: RevenueCatEvent): NormalizedEntitlement | null {
  const status = event.type ? STATUS_BY_EVENT[event.type] : undefined;
  if (!status) return null;
  return {
    status,
    productId: event.product_id ?? null,
    store: event.store ?? null,
    isSandbox: event.environment === "SANDBOX",
    currentPeriodEndsAt: typeof event.expiration_at_ms === "number" ? event.expiration_at_ms : null,
    willRenew: status === "active",
  };
}
