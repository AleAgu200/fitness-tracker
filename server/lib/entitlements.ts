import { and, count, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { planGenerationJobs, subscriptions } from "@/db/schema";

/** RevenueCat entitlement identifier configured in the dashboard. */
export const PULSO_PLUS = "pulso_plus";

/**
 * Free athletes get their first generated plan so the app works out of the box;
 * the paywall appears when they ask for another one. Onboarding must never hit
 * a hard wall — see PRODUCT.md principle 1.
 */
export const FREE_GENERATION_LIMIT = 1;

/** Statuses that still grant access — a billing retry should not lock someone out mid-period. */
const ENTITLED_STATUSES = ["active", "in_grace_period", "billing_issue"] as const;

import { sandboxEntitlementAllowed } from "@/lib/entitlement-policy";

export { sandboxEntitlementAllowed };

export interface EntitlementState {
  entitled: boolean;
  status: string | null;
  productId: string | null;
  currentPeriodEndsAt: number | null;
  willRenew: boolean;
}

export async function getEntitlement(userId: string, now = Date.now()): Promise<EntitlementState> {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!row) {
    return { entitled: false, status: null, productId: null, currentPeriodEndsAt: null, willRenew: false };
  }

  const statusAllows = (ENTITLED_STATUSES as readonly string[]).includes(row.status);
  // A period that has elapsed without a renewal event is not entitlement: the
  // webhook may simply not have arrived, and we must fail closed on paid work.
  const periodValid = row.currentPeriodEndsAt == null || row.currentPeriodEndsAt > now;
  const sandboxAllows = sandboxEntitlementAllowed(row.isSandbox);

  return {
    entitled: statusAllows && periodValid && sandboxAllows,
    status: row.status,
    productId: row.productId,
    currentPeriodEndsAt: row.currentPeriodEndsAt,
    willRenew: row.willRenew,
  };
}

/** Generations that actually produced a plan — a failed attempt costs the athlete nothing. */
export async function countCompletedGenerations(userId: string): Promise<number> {
  const [row] = await db.select({ value: count() })
    .from(planGenerationJobs)
    .where(and(
      eq(planGenerationJobs.userId, userId),
      inArray(planGenerationJobs.status, ["succeeded", "requires_review"]),
      isNotNull(planGenerationJobs.completedAt),
    ));
  return Number(row?.value ?? 0);
}

export type GenerationDenialReason = "free_quota_exhausted";

export interface GenerationAllowance {
  allowed: boolean;
  entitled: boolean;
  freeUsed: number;
  freeLimit: number;
  reason: GenerationDenialReason | null;
}

/**
 * Whether this athlete may start another AI plan generation.
 *
 * Called on every generation entry point. Subscribers are unlimited; everyone
 * else gets FREE_GENERATION_LIMIT completed plans before the paywall.
 */
export async function canGeneratePlan(userId: string, now = Date.now()): Promise<GenerationAllowance> {
  const entitlement = await getEntitlement(userId, now);
  if (entitlement.entitled) {
    return { allowed: true, entitled: true, freeUsed: 0, freeLimit: FREE_GENERATION_LIMIT, reason: null };
  }

  const freeUsed = await countCompletedGenerations(userId);
  return {
    allowed: freeUsed < FREE_GENERATION_LIMIT,
    entitled: false,
    freeUsed,
    freeLimit: FREE_GENERATION_LIMIT,
    reason: freeUsed < FREE_GENERATION_LIMIT ? null : "free_quota_exhausted",
  };
}

/** 402 body shape shared by every AI entry point so the app can show one paywall. */
export function paywallResponse(allowance: GenerationAllowance): Response {
  return Response.json({
    error: "subscription_required",
    reason: allowance.reason,
    freeUsed: allowance.freeUsed,
    freeLimit: allowance.freeLimit,
    entitlement: PULSO_PLUS,
  }, { status: 402 });
}
